/* ============================================================
   Degree Path / Advisor Console — shared curriculum engine
   Handles: earned vs in-progress, multi-valid placement,
            2-of-3 regional groups, DegreeWorks PDF parsing
   ============================================================ */
var DP = (function(){
"use strict";
var C=null;
function init(curriculum){ C=curriculum; return API; }

/* ---------- structure ---------- */
function blocks(){ return [C.requirements.ge, C.requirements.major, C.requirements.gen_electives]; }
function sections(){ var o=[]; blocks().forEach(function(b){b.sections.forEach(function(s){o.push(s);});}); return o; }
function sectionOf(id){ return sections().find(function(s){return s.id===id;}); }
function isGeSection(id){ return C.requirements.ge.sections.some(function(s){return s.id===id;}); }
function findCourse(n){ if(!n)return null; return C.catalog[String(n).trim().toUpperCase()]||null; }
function geCourse(n){ if(!n)return null; n=String(n).trim().toUpperCase();
  return C.ge_catalog.find(function(g){return g.number.toUpperCase()===n;})||null; }

/* ---------- course status: the core distinction ----------
   complete    = a passing grade is on the books
   inprogress  = registered/preregistered, no grade yet  (NOT earned)
   failed      = F/W/NC — earns nothing
   planned     = a row with no grade and no PR marker
------------------------------------------------------------ */
var FAIL=["F","W","WF","I","NC","U"];
function status(c){
  var g=String(c.grade==null?"":c.grade).trim().toUpperCase();
  if(c.inProgress) return "inprogress";
  if(!g) return "planned";
  if(g==="PR"||g==="IP") return "inprogress";
  if(FAIL.indexOf(g)>-1) return "failed";
  return "complete";
}
function nm(v){ var n=parseFloat(v); return isNaN(n)?0:n; }

/* earned = complete coursework only.
   A waiver satisfies the REQUIREMENT but grants no credit hours — the
   student still has to reach 120 with real coursework from elsewhere. */
function earned(state,id){
  return (state.courses[id]||[]).reduce(function(t,c){
    return t + (status(c)==="complete" ? nm(c.credits) : 0);
  },0);
}
function isWaived(state,id){ return !!(state.waived && state.waived[id]); }

/* ---------- advisor override ----------
   The engine can be wrong: substitutions, petitions, departmental
   exceptions, courses the catalog doesn't know. An advisor can declare a
   requirement met, with a reason. The override satisfies the requirement
   but invents no credit hours. */
function override(state,id){
  return (state.overrides && state.overrides[id]) || null;
}
function inProgress(state,id){
  return (state.courses[id]||[]).reduce(function(t,c){
    return t + (status(c)==="inprogress" ? nm(c.credits) : 0);
  },0);
}

/* ---------- regional: choose 2 of 3 groups ---------- */
var REGIONS=["African","European","Latin American"];
function regionalGroups(state,countInProgress){
  var got={};
  (state.courses["regional"]||[]).forEach(function(c){
    var st=status(c);
    if(st!=="complete" && !(countInProgress && st==="inprogress")) return;
    var cat=findCourse(c.number); if(!cat)return;
    REGIONS.forEach(function(g){
      if(cat.valid.indexOf(g)>-1) got[g]=(got[g]||0)+nm(c.credits);
    });
  });
  return got;
}
function regionsHeld(state,countInProgress){
  var g=regionalGroups(state,countInProgress);
  return Object.keys(g).filter(function(k){return g[k]>=3;});
}

/* ---------- placement validity ----------
   A course is only "misplaced" if it CANNOT satisfy this section.
   Courses valid in several places (e.g. HIST 1540 is a GE social
   science option AND a fine general elective) are never flagged.
------------------------------------------------------------------ */
function validPlacement(sec,course){
  if(!sec) return null;
  if(sec.rule==="free") return true;            // general electives take anything
  if(sec.rule==="fill") return true;            // history electives: any HIST course
  var cat=findCourse(course.number);
  var ge=geCourse(course.number);
  if(isGeSection(sec.id)){
    if(sec.id==="writing_int") return /HIST\s*2000/i.test(course.number||"") || (ge&&ge.section==="Writing Intensive");
    if(sec.id==="speaking_int") return /MSCM/i.test(course.number||"") || (ge&&ge.section==="Speaking Intensive");
    if(!ge) return null;                         // unknown course: don't presume
    return ge.section===sec.label;
  }
  if(!cat) return null;
  if(sec.rule==="list")   return sec.required.indexOf(cat.number)>-1;
  if(sec.rule==="groups") return sec.groups.some(function(t){return cat.valid.indexOf(t)>-1;});
  if(sec.rule==="choose") return cat.valid.indexOf(sec.tag)>-1;
  return null;
}

/* ---------- section state ---------- */
/* ---------- auto-satisfied requirements ----------
   Foundations of American Democracy is satisfied for History majors by
   HIST 1320, which they already take for Social Science. Writing Intensive
   is satisfied by HIST 2000, whose credits count in the major. Neither adds
   GE credit hours. */
function autoSatisfied(state,sec){
  if(!sec.auto) return false;
  var want=sec.auto.toUpperCase();
  var found=false;
  sections().forEach(function(s){
    (state.courses[s.id]||[]).forEach(function(c){
      if(String(c.number||"").trim().toUpperCase()===want && status(c)==="complete") found=true;
    });
  });
  return found;
}

function sectionState(state,sec){
  var e=earned(state,sec.id), p=inProgress(state,sec.id);
  var ov=override(state,sec.id);
  if(ov){
    return {label:"\u2713 Met \u2014 advisor override",cls:"met",earned:e,prog:p,met:true,
            overridden:true,reason:ov.reason||"",by:ov.by||"",date:ov.date||""};
  }
  if(isWaived(state,sec.id)){
    var lbl="\u2713 Waived";
    lbl += (e>0) ? " \u00B7 "+e+" hrs earned" : " \u00B7 0 hrs";
    return {label:lbl,cls:"met",earned:e,prog:p,met:true,waived:true};
  }
  if(sec.rule==="flag"){
    if(autoSatisfied(state,sec))
      return {label:"\u2713 Met by "+sec.auto,cls:"met",earned:e,prog:p,met:true,auto:true};
    var has=(state.courses[sec.id]||[]).some(function(c){return status(c)==="complete";});
    return {label:has?"\u2713 On record":"Needed",cls:has?"met":"empty",earned:e,prog:p,met:has};
  }
  if(sec.rule==="groups"){
    var have=regionsHeld(state,false), withProg=regionsHeld(state,true);
    var met=have.length>=2;
    var lbl2;
    if(met) lbl2="\u2713 Met \u2014 "+have.join(" + ");
    else if(withProg.length>=2) lbl2=have.length+" of 2 earned \u00B7 "+(withProg.length-have.length)+" in progress";
    else lbl2=have.length+" of 2 groups";
    return {label:lbl2,cls:met?"met":(e>0||p>0?"partial":"empty"),earned:e,prog:p,met:met,
            groups:have,groupsProg:withProg};
  }
  var met2=e>=sec.hours&&sec.hours>0;
  var lbl3;
  if(met2) lbl3="\u2713 Met";
  else if(p>0) lbl3=e+"/"+sec.hours+" earned \u00B7 "+p+" in progress";
  else if(e>0) lbl3=e+"/"+sec.hours+" hrs";
  else lbl3="Not started";
  return {label:lbl3,cls:met2?"met":((e>0||p>0)?"partial":"empty"),earned:e,prog:p,met:met2};
}

/* A block is met when all of its sections are met — not when a credit
   total is reached. General Education is a 39-40 range precisely because
   Math, Science, and Arts & Humanities each carry a range. */
function blockMet(state,block){
  return block.sections.every(function(s){ return sectionState(state,s).met; });
}

/* ---------- graduation check ----------
   Two independent tests, and they are not the same question:
     1. Are the REQUIREMENTS met?  (the primary determination)
     2. Are there 120 HOURS?       (a sharp secondary check)
   A student can hold 120 hours and still not graduate; another can have every
   requirement met and simply need elective hours. Name which one applies. */
function requirements(state){
  var met=[], unmet=[];
  sections().forEach(function(sec){
    if(sec.rule==="free") return;                 // electives aren't a requirement
    var st=sectionState(state,sec);
    (st.met?met:unmet).push({id:sec.id,label:sec.label,state:st});
  });
  return {met:met,unmet:unmet,total:met.length+unmet.length,
          count:met.length,allMet:unmet.length===0};
}
function graduationCheck(state){
  var r=requirements(state);
  var t=totals(state);
  var creditsMet=t.earned>=C.degree.total;
  var blockers=[];
  if(!r.allMet) blockers.push(r.unmet.length+" requirement(s) not yet met");
  if(!creditsMet) blockers.push((C.degree.total-t.earned)+" credit hour(s) short of "+C.degree.total);
  return {
    requirementsMet:r.allMet, requirementsCount:r.count, requirementsTotal:r.total,
    unmet:r.unmet,
    creditsMet:creditsMet, earned:t.earned, needed:C.degree.total,
    shortHours:Math.max(0,C.degree.total-t.earned),
    ready:r.allMet&&creditsMet,
    blockers:blockers,
    /* the case worth naming: everything is satisfied but the hours aren't there */
    hoursOnly:r.allMet&&!creditsMet
  };
}

/* ---------- totals ---------- */
function totals(state){
  var o={earned:0,prog:0,byBlock:{}};
  blocks().forEach(function(b){
    var e=0,p=0;
    b.sections.forEach(function(s){
      e+=earned(state,s.id); p+=inProgress(state,s.id);
    });
    o.byBlock[b.label]={earned:e,prog:p,total:b.total,
                        min:b.min||b.total,max:b.max||b.total,
                        met:blockMet(state,b),dynamic:!!b.dynamic};
    o.earned+=e; o.prog+=p;
  });
  /* ---- how the degree closes to 120 ----
     GEC is a range (Math 3-5, Science 6-8, Arts & Hum 5-6), the Major is
     fixed at 42, and General Electives are the RESIDUAL that absorbs the
     GEC range so the total always lands on 120. So the elective target is
     computed from the student's projected path, never hardcoded. */
  function shortfall(block){
    return block.sections.reduce(function(t,s){
      if(isWaived(state,s.id)||override(state,s.id)) return t;
      if(!s.hours) return t;                        // flag-only sections carry no hours
      var st=sectionState(state,s);
      if(st.met) return t;
      return t + Math.max(0, s.hours - st.earned - st.prog);
    },0);
  }
  var geB=o.byBlock["General Education"], mjB=o.byBlock["Major in History"];
  var geShort=shortfall(C.requirements.ge);
  var mjShort=shortfall(C.requirements.major);

  // what GEC and the major will total once their outstanding requirements are met
  var geProjected=geB.earned+geB.prog+geShort;
  var mjProjected=mjB.earned+mjB.prog+mjShort;
  geB.shortfall=geShort; geB.projected=geProjected;
  mjB.shortfall=mjShort; mjB.projected=mjProjected;

  var el=o.byBlock["Required General Electives"];
  el.total  = Math.max(0, C.degree.total - geProjected - mjProjected);
  el.needed = Math.max(0, el.total - el.earned - el.prog);

  o.remaining = Math.max(0, C.degree.total - o.earned - o.prog);
  var typ=C.degree.typical||{gec:39,major:42,electives:39};
  o.ledger={
    gec:{earned:geB.earned,prog:geB.prog,short:geShort,projected:geProjected,typical:typ.gec},
    major:{earned:mjB.earned,prog:mjB.prog,short:mjShort,projected:mjProjected,typical:typ.major},
    electives:{earned:el.earned,prog:el.prog,target:el.total,needed:el.needed,typical:typ.electives},
    total:C.degree.total,
    typical:typ,
    /* the arithmetic must close: what's outstanding across the three buckets
       equals what's outstanding overall */
    closes:(geShort+mjShort+el.needed)===o.remaining
  };
  return o;
}
function geLabel(){
  var g=C.requirements.ge;
  return (g.min&&g.max&&g.min!==g.max) ? g.min+"\u2013"+g.max : String(g.total);
}

/* ---------- advising flags: what actually needs attention ---------- */
function flags(state){
  var out=[];
  sections().forEach(function(sec){
    if(sec.rule==="free") return;
    if(isWaived(state,sec.id)) return;
    if(override(state,sec.id)) return;           // advisor has declared it met
    var st=sectionState(state,sec);
    if(st.met) return;
    if(sec.rule==="flag"){
      out.push({level:"need",section:sec.label,
        text:"Not yet satisfied"+(sec.auto?" \u2014 normally met by "+sec.auto+".":".")});
      return;
    }
    var e=st.earned, p=st.prog;
    if(e===0 && p>0){
      out.push({level:"warn",section:sec.label,
        text:"No credits earned yet \u2014 this requirement rests entirely on "+p+" hr(s) currently in progress. If the student drops or fails, the requirement is unmet."});
    } else if(sec.rule==="groups"){
      var need=2-(st.groups?st.groups.length:0);
      if(need>0) out.push({level:"need",section:sec.label,
        text:"Needs "+need+" more regional group (any of: "+REGIONS.filter(function(r){return (st.groups||[]).indexOf(r)<0;}).join(", ")+")."});
    } else if(sec.hours>0){
      var short=sec.hours-e-p;
      if(short>0) out.push({level:"need",section:sec.label,
        text:"Short "+short+" hr(s)"+(p>0?" even after in-progress work completes":"")+"."});
      else if(p>0) out.push({level:"watch",section:sec.label,
        text:"Will be met only when "+p+" in-progress hr(s) complete successfully."});
    }
  });
  // failed courses worth noting
  sections().forEach(function(sec){
    (state.courses[sec.id]||[]).forEach(function(c){
      if(status(c)==="failed"&&String(c.grade).toUpperCase()==="F"){
        out.push({level:"note",section:sec.label,text:"Failed "+c.number+" ("+(c.title||"")+")."});
      }
    });
  });
  // overrides: the record should show what the advisor declared, and why
  sections().forEach(function(sec){
    var ov=override(state,sec.id);
    if(!ov) return;
    out.push({level:"note",section:sec.label,
      text:"Marked met by advisor"+(ov.by?" ("+ov.by+")":"")+(ov.date?" on "+ov.date:"")+
        (ov.reason?": "+ov.reason:". No reason recorded.")});
  });
  // waivers: requirement met, but the hours still have to come from somewhere
  var wv=sections().filter(function(s){return isWaived(state,s.id);});
  if(wv.length){
    var hrs=wv.reduce(function(t,s){return t+s.hours;},0);
    out.push({level:"note",section:"Waivers",
      text:wv.map(function(s){return s.label;}).join(" and ")+" waived. The requirement is satisfied, but the "+
        hrs+" hr(s) are not credited \u2014 they must still be made up through electives to reach "+C.degree.total+"."});
  }
  var t=totals(state);
  var el=t.byBlock["Required General Electives"];
  if(el.needed>0){
    out.push({level:"need",section:"General Electives",
      text:el.needed+" more elective hr(s) needed ("+el.earned+" of "+el.total+" earned"+
        (el.prog?", "+el.prog+" in progress":"")+")."});
  }
  if(t.remaining>0){
    out.push({level:"need",section:"Total Credits",
      text:t.remaining+" credit hr(s) still needed to reach "+C.degree.total+
        " ("+t.earned+" earned"+(t.prog?", "+t.prog+" in progress":"")+")."});
  }
  return out;
}

/* ============ DegreeWorks PDF text parsing ============ */
var SECTION_MAP=[
 ["COMMUNICATION SKILLS","eng_comp"],["ENGLISH COMPOSITION","eng_comp"],
 ["FOREIGN LANGUAGE","foreign_lang"],["MATHEMATICS","math"],
 ["SCIENCE REQUIREMENT","science"],["SOCIAL SCIENCES","social_science"],
 ["FOUNDATIONS OF AMERICAN","foundations"],["ARTS AND HUMANITIES","arts_hum"],
 ["HEALTH AND FITNESS","health"],["SOCIAL AND CAREER","career"],
 ["INTENSIVE SPEAKING","speaking_int"],["INTENSIVE WRITING","writing_int"],
 ["HISTORY DEPARTMENTAL","core_required"],["SELECT 2 GROUPS","regional"],
 ["REQUIRED GENERAL ELECTIVES","gen_electives"],["FALL THROUGH","gen_electives"],
 ["INSUFFICIENT","_insufficient"],["PREREGISTERED","_skip"],
 ["LEGEND","_skip"],["DISCLAIMER","_skip"]
];
var SUB_MAP=[["SEMINAR COURSE","seminar"],["HISTORY ELECTIVE","hist_electives"]];
var COURSE_RE=/\b([A-Z]{2,5})\s+(\d{4})\s+(.+?)\s+(PR|[A-DF][+\-]?|T|W|I|NC|S|U)\s+\(?(\d+(?:\.\d+)?)\)?\s+(Fall|Spring|Summer|Winter)\s+(\d{4})/;

/* A header line: carries no course code, and either shouts (DegreeWorks
   style) or matches a known section name in any case. */
function looksLikeHeader(L){
  if(COURSE_RE.test(L)) return false;
  if(/^Satisfied by:/i.test(L)) return false;
  var letters=L.replace(/[^A-Za-z]/g,"");
  if(!letters.length) return false;
  var U=L.toUpperCase();
  for(var i=0;i<SECTION_MAP.length;i++){
    if(U.indexOf(SECTION_MAP[i][0])>-1) return true;   // named section, any case
  }
  var caps=L.replace(/[^A-Z]/g,"").length;
  return (caps/letters.length)>0.7;
}

/* Where does the catalog say this course can actually live? */
function catalogHome(number){
  var ge=geCourse(number);
  if(ge){
    var hit=C.requirements.ge.sections.find(function(s){return s.label===ge.section;});
    if(hit) return hit.id;
  }
  var cat=findCourse(number);
  if(cat){
    if(["HIST 1100","HIST 2000","HIST 2210","HIST 2220","HIST 2890"].indexOf(cat.number)>-1) return "core_required";
    if(cat.valid.indexOf("Seminar")>-1) return "seminar";
    if(REGIONS.some(function(r){return cat.valid.indexOf(r)>-1;})) return "regional";
    return "hist_electives";
  }
  return null;
}

/* Correction pass: a course parked somewhere it cannot satisfy gets rehomed.
   GE sections are strict — only courses on that section's approved list belong.
   Anything unrecognised falls through to general electives, which is what
   DegreeWorks does with it anyway. */
function reconcile(courses){
  var moved=[];
  var strict=C.requirements.ge.sections.map(function(s){return s.id;})
    .concat(["core_required","seminar","regional"]);
  strict.forEach(function(sid){
    var sec=sectionOf(sid);
    var keep=[];
    (courses[sid]||[]).forEach(function(c){
      if(validPlacement(sec,c)===false || (isGeSection(sid) && !geCourse(c.number))){
        var home=catalogHome(c.number) || "gen_electives";
        if(home===sid){ keep.push(c); return; }
        courses[home]=courses[home]||[];
        courses[home].push(c);
        moved.push({number:c.number,from:sec.label,to:sectionOf(home).label});
      } else keep.push(c);
    });
    courses[sid]=keep;
  });
  return moved;
}

function parseAudit(text){
  var lines=text.split(/\r?\n/);
  var section="gen_electives", seen={}, courses={}, info={}, waived={}, failed=[];
  sections().forEach(function(s){courses[s.id]=[];});

  lines.forEach(function(raw){
    var L=raw.trim(); if(!L) return;
    if(/^Satisfied by:/i.test(L)) return;

    var m1=L.match(/Student name\s+(.+?)(?:\s+Student ID|$)/i); if(m1) info.name=cleanName(m1[1]);
    var m2=L.match(/Student ID\s+(\S+)/i); if(m2) info.bannerId=m2[1];
    var m3=L.match(/Catalog year:\s*([\d\u2013\-]+)/i); if(m3&&!info.catalogYear) info.catalogYear=m3[1];
    var m4=L.match(/Last Term Attended\s+(\w+\s+\d{4})/i); if(m4) info.lastTerm=m4[1];
    var m5=L.match(/Overall GPA\s+([\d.]+)/i); if(m5) info.gpa=m5[1];

    if(/WAIVED/i.test(L)){
      if(/FOUNDATIONS/i.test(L)) waived["foundations"]=true;
      if(/FIRST YEAR SEMINAR/i.test(L)) waived["career"]=true;
    }

    /* Only a genuine header line may change the section. */
    if(looksLikeHeader(L)){
      var U=L.toUpperCase();
      for(var i=0;i<SECTION_MAP.length;i++){
        if(U.indexOf(SECTION_MAP[i][0])>-1){ section=SECTION_MAP[i][1]; break; }
      }
    } else {
      var U2=L.toUpperCase();
      for(var j=0;j<SUB_MAP.length;j++){
        if(U2.indexOf(SUB_MAP[j][0])===0){ section=SUB_MAP[j][1]; break; }
      }
    }
    if(section==="_skip") return;

    var m=L.match(COURSE_RE);
    if(!m) return;
    var number=m[1]+" "+m[2], grade=m[4], credits=parseFloat(m[5]);
    var term=m[6].slice(0,2)+" "+m[7].slice(2);

    if(section==="_insufficient"||grade==="F"||credits===0){
      if(grade==="F") failed.push({number:number,title:m[3].trim(),term:term});
      return;
    }
    var key=section+"|"+number;
    if(seen[key]) return;
    seen[key]=true;
    courses[section].push({
      number:number, title:m[3].trim(), credits:credits,
      grade:(grade==="PR"?"":grade),
      inProgress:(grade==="PR"),
      semester:term,
      notes:(grade==="PR"?"Registered \u2014 not yet earned":(grade==="T"?"Transfer credit":""))
    });
  });

  var moved=reconcile(courses);
  return {courses:courses, info:info, waived:waived, failed:failed, moved:moved};
}
function cleanName(s){
  s=s.replace(/\s*-\s*\*+\d+\s*$/,"").trim();
  if(s.indexOf(",")>-1){ var p=s.split(","); return (p[1]||"").trim()+" "+(p[0]||"").trim(); }
  return s;
}

/* extract text from a PDF ArrayBuffer using pdf.js */
function readPdf(arrayBuffer){
  return pdfjsLib.getDocument({data:new Uint8Array(arrayBuffer)}).promise.then(function(pdf){
    var pages=[]; for(var p=1;p<=pdf.numPages;p++) pages.push(p);
    return Promise.all(pages.map(function(p){
      return pdf.getPage(p).then(function(pg){return pg.getTextContent();}).then(function(tc){
        var rows={};
        tc.items.forEach(function(it){
          var y=Math.round(it.transform[5]);
          (rows[y]=rows[y]||[]).push({x:it.transform[4],s:it.str});
        });
        return Object.keys(rows).sort(function(a,b){return b-a;}).map(function(y){
          return rows[y].sort(function(a,b){return a.x-b.x;})
            .map(function(o){return o.s;}).join(" ").replace(/\s+/g," ").trim();
        }).join("\n");
      });
    })).then(function(t){return t.join("\n");});
  });
}

var API={init:init,blocks:blocks,sections:sections,sectionOf:sectionOf,blockMet:blockMet,geLabel:geLabel,isWaived:isWaived,override:override,autoSatisfied:autoSatisfied,
  findCourse:findCourse,geCourse:geCourse,status:status,nm:nm,
  earned:earned,inProgress:inProgress,validPlacement:validPlacement,
  sectionState:sectionState,totals:totals,flags:flags,requirements:requirements,graduationCheck:graduationCheck,
  parseAudit:parseAudit,readPdf:readPdf,REGIONS:REGIONS,
  get curriculum(){return C;}};
return API;
})();
