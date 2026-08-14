(function(){
"use strict";
DP.init(CURRICULUM);

var caseload=null, activeId=null, filePath=null, editMode=false, saveTimer=null;

var pendingSave=false;
function save(){
  if(!caseload) return;
  pendingSave=true;
  setStatus("saving");
  clearTimeout(saveTimer);
  saveTimer=setTimeout(function(){
    window.ac.writeCaseload(caseload).then(function(r){
      pendingSave=!r.ok;
      setStatus(r.ok?"saved":"error", r.error);
    });
  },400);
}
/* A debounced save can be lost if the window closes before it fires.
   Flush synchronously on the way out so the last edit always reaches disk. */
window.addEventListener("beforeunload",function(){
  if(pendingSave && caseload){
    clearTimeout(saveTimer);
    try{ window.ac.flushSync(caseload); pendingSave=false; }catch(e){}
  }
});
function setStatus(mode,detail){
  var el=document.getElementById("fileStatus");
  var name=filePath?filePath.split("/").pop():"";
  if(mode==="saving"){el.className="filestatus saving";el.innerHTML='<span class="dot"></span>Saving\u2026';}
  else if(mode==="error"){el.className="filestatus saving";el.innerHTML='<span class="dot"></span>Save failed';}
  else {el.className="filestatus";el.innerHTML='<span class="dot"></span>Saved \u00B7 '+esc(name);}
}
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function uid(){return "a"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function active(){return caseload?caseload.advisees.find(function(a){return a.id===activeId;}):null;}

function blankStudent(){
  var s={info:{name:"",bannerId:"",email:"",expectedGrad:"",advisor:"",catalogYear:"",gpa:"",lastTerm:""},
    courses:{},waived:{},overrides:{},goals:{},internships:[],communityHours:"",failed:[]};
  DP.sections().forEach(function(x){s.courses[x.id]=[];});
  return s;
}
function normalize(a){
  a.advisor=a.advisor||{};
  a.advisor.comments=a.advisor.comments||{};
  if(!Array.isArray(a.advisor.meetings))a.advisor.meetings=[];
  a.advisor.sectionNotes=a.advisor.sectionNotes||{};
  if(!Array.isArray(a.advisor.questions))a.advisor.questions=[];
  a.student.waived=a.student.waived||{};
  a.student.overrides=a.student.overrides||{};
  a.student.failed=a.student.failed||[];
  a.student.goals=a.student.goals||{};
  a.student.internships=a.student.internships||[];
  DP.sections().forEach(function(s){ if(!a.student.courses[s.id]) a.student.courses[s.id]=[]; });
}

/* ---------- roster ---------- */
function renderRoster(){
  var r=document.getElementById("roster");
  if(!caseload){r.innerHTML="";return;}
  if(!caseload.advisees.length){r.innerHTML='<div class="rosterempty">No advisees yet.</div>';return;}
  r.innerHTML=caseload.advisees.map(function(a){
    var t=DP.totals(a.student);
    var fl=DP.flags(a.student).filter(function(f){return f.level==="warn";}).length;
    return '<button class="advisee'+(a.id===activeId?" active":"")+'" data-id="'+a.id+'">'+
      '<span class="nm">'+esc(a.student.info.name||"Unnamed")+(fl?'<span class="flagdot"></span>':'')+'</span>'+
      '<span class="meta">'+t.earned+' earned'+(t.prog?' \u00B7 '+t.prog+' in prog':'')+' / 120</span></button>';
  }).join("");
}

/* ---------- main ---------- */
function renderMain(){
  var main=document.getElementById("main");
  if(!caseload){
    main.innerHTML='<div class="empty-main"><h2>Advisor Console</h2>'+
      '<p>Your caseload lives in one file on this Mac. Every comment, note, and meeting log saves to it automatically. Nothing leaves this machine.</p>'+
      '<div class="row"><button class="bigbtn" id="bCreate">Create Caseload File</button>'+
      '<button class="bigbtn ghost" id="bOpen">Open Existing</button></div></div>';
    document.getElementById("bCreate").addEventListener("click",function(){window.ac.createCaseload().then(afterOpen);});
    document.getElementById("bOpen").addEventListener("click",function(){window.ac.openCaseload().then(afterOpen);});
    return;
  }
  if(!activeId||!active()){
    main.innerHTML='<div class="empty-main"><h2>Caseload Open</h2>'+
      '<p>Import a student\u2019s DegreeWorks audit PDF, their Degree Path file, or build a record by hand.</p>'+
      '<div class="row"><button class="bigbtn" id="eImportPdf">Import DegreeWorks PDF</button>'+
      '<button class="bigbtn ghost" id="eNew">New Blank Student</button></div></div>';
    document.getElementById("eImportPdf").addEventListener("click",function(){importPdf(null);});
    document.getElementById("eNew").addEventListener("click",newStudent);
    return;
  }
  var a=active(), i=a.student.info, t=DP.totals(a.student);
  var geB=t.byBlock["General Education"], mjB=t.byBlock["Major in History"], elB=t.byBlock["Required General Electives"];
  main.innerHTML=
  '<div class="topbar">'+
    '<div id="printHead">NCCU Department of History \u00B7 Advising Summary \u00B7 '+new Date().toLocaleDateString()+'</div>'+
    '<h2>'+esc(i.name||"Unnamed Student")+'</h2>'+
    '<div class="meta"><span>Banner '+esc(i.bannerId||"\u2014")+'</span><span>GPA '+esc(i.gpa||"\u2014")+'</span>'+
      '<span class="catalog'+(i.catalogYear?"":" missing")+'">Catalog '+esc(i.catalogYear||"NOT SET")+'</span>'+
      '<span>Last term '+esc(i.lastTerm||"\u2014")+'</span></div>'+
    '<div class="topbar-actions">'+
      '<button class="tbtn" id="bEdit">'+(editMode?"Done Editing":"Edit Record")+'</button>'+
      '<button class="tbtn" id="bPdfIn">Refresh from PDF</button>'+
      '<button class="tbtn" id="bXls">Export Excel</button>'+
      '<button class="tbtn danger" id="bRemove">Remove</button>'+
      '<button class="tbtn solid" id="bPdfOut">Export PDF</button>'+
    '</div></div>'+
  '<div class="body">'+
    (editMode?'<div class="editbanner">\u270E Editing this record. Changes save to your caseload \u2014 the student\u2019s own copy is untouched.</div>':'')+
    verdict(a.student)+
    '<div class="dash">'+
      dreq("General Education",geB.met,geB.earned,DP.geLabel(),geB.prog)+
      dreq("Major in History",mjB.met,mjB.earned,"42",mjB.prog)+
      dstat("Credit Hours",t.earned,120,t.prog)+
      dstat("General Electives",elB.earned,Math.max(1,elB.earned+elB.prog+elB.needed),elB.prog)+
    '</div>'+
    '<div class="tabbar" id="tabbar">'+
      '<button class="tab active" data-tab="summary">Advising Summary<span class="cnt" id="fcnt"></span></button>'+
      '<button class="tab" data-tab="progress">Degree Progress</button>'+
      '<button class="tab" data-tab="goals">Goals</button>'+
      '<button class="tab" data-tab="internships">Internships</button>'+
      '<button class="tab" data-tab="meetings">Meeting Log<span class="cnt" id="mcnt"></span></button>'+
    '</div>'+
    '<div class="panel active" id="p-summary"></div>'+
    '<div class="panel" id="p-progress"></div>'+
    '<div class="panel" id="p-goals"></div>'+
    '<div class="panel" id="p-internships"></div>'+
    '<div class="panel" id="p-meetings"></div>'+
  '</div>';
  renderSummary();renderProgress();renderGoals();renderInternships();renderMeetings();
  document.getElementById("mcnt").textContent=a.advisor.meetings.length||"";
  wire();
}
/* The verdict bar: requirements first, hours second. */
function verdict(stu){
  var g=DP.graduationCheck(stu);
  var cls = g.ready ? "ok" : (g.requirementsMet ? "hours" : "open");
  var h='<div class="verdict '+cls+'">';
  h+='<div class="v-main"><span class="v-count">'+g.requirementsCount+'<span class="v-of">/'+g.requirementsTotal+'</span></span>'+
     '<span class="v-lbl">requirements met</span></div>';
  h+='<div class="v-body">';
  if(g.ready){
    h+='<strong>All requirements met and 120 hours earned.</strong> Confirm with the Registrar.';
  } else if(g.hoursOnly){
    h+='<strong>Every requirement is met.</strong> The student is '+g.shortHours+
       ' credit hour(s) short of 120 — any electives will close the gap.';
  } else {
    h+='<strong>'+g.unmet.length+' requirement(s) outstanding:</strong> '+
       g.unmet.map(function(u){return esc(u.label);}).join(", ")+'.';
    if(!g.creditsMet) h+=' Also '+g.shortHours+' hr(s) short of 120.';
  }
  h+='</div></div>';
  return h;
}
function dreq(lbl,met,earned,ofLabel,prog){
  return '<div class="stat req'+(met?" done":"")+'">'+
    '<div class="num">'+(met?'\u2713':'\u2014')+'<span class="of"> '+(met?'met':'not met')+'</span></div>'+
    '<div class="lbl">'+lbl+'</div>'+
    '<div class="subhrs">'+earned+' / '+ofLabel+' hrs'+(prog?' <span class="pg">+'+prog+' in prog</span>':'')+'</div></div>';
}
function ledgerRow(name,typical,earned,prog,short,total,req){
  var off = total!==typical;
  return '<tr><td><span class="lname">'+name+'</span><span class="lreq">'+req+'</span></td>'+
    '<td class="ltyp">'+typical+'</td>'+
    '<td>'+earned+'</td><td class="lprog">'+(prog||"\u2014")+'</td>'+
    '<td class="'+(short>0?"lshort":"lok")+'">'+(short>0?short:"\u2713")+'</td>'+
    '<td class="ltotal'+(off?" loff":"")+'">'+total+'</td></tr>';
}
function dstatRange(lbl,n,ofLabel,prog,met){
  return '<div class="stat'+(met?" done":"")+'"><div class="num">'+n+'<span class="of">/'+ofLabel+'</span></div>'+
    '<div class="lbl">'+lbl+(prog?' <span class="pg">+'+prog+' in prog</span>':'')+'</div>'+
    '<div class="bar"><span class="e" style="width:'+(met?100:Math.min(95,Math.round(n/40*100)))+'%"></span></div></div>';
}
function dstat(lbl,n,of,prog){
  var pct=Math.min(100,Math.round(n/of*100));
  var ppct=Math.min(100-pct,Math.round((prog||0)/of*100));
  return '<div class="stat'+(n>=of?" done":"")+'"><div class="num">'+n+'<span class="of">/'+of+'</span></div>'+
    '<div class="lbl">'+lbl+(prog?' <span class="pg">+'+prog+' in prog</span>':'')+'</div>'+
    '<div class="bar"><span class="e" style="width:'+pct+'%"></span><span class="p" style="width:'+ppct+'%"></span></div></div>';
}

/* ---------- advising summary ---------- */
function renderSummary(){
  var a=active(), stu=a.student, fl=DP.flags(stu);
  document.getElementById("fcnt").textContent=fl.filter(function(f){return f.level==="warn";}).length||"";
  var html="";

  html+='<div class="catalert"><strong>Catalog year: '+esc(stu.info.catalogYear||"NOT SET")+'.</strong> '+
    'Verify this is the catalog the student is actually held to. Readmitted and transfer students are often assigned the <em>current</em> catalog by DegreeWorks even when they first enrolled under an earlier one, and requirements differ between catalogs.</div>';

  /* ---- Path to 120: show the arithmetic, don't just assert a number ---- */
  var t=DP.totals(stu), L=t.ledger;
  var TY=L.typical;
  html+='<div class="card"><h3>Path to 120</h3>'+
    '<p class="cardnote">A History major typically closes at <strong>'+TY.gec+' + '+TY.major+' + '+TY.electives+'</strong>. '+
      'The major is fixed at 42; gen ed can run to 40 with a 5-credit math or an 8-credit science pair, and electives absorb the difference so the total stays 120.</p>'+
    '<table class="ledger"><thead><tr><th>Requirement</th><th>Typical</th><th>Earned</th><th>In progress</th>'+
    '<th>Still short</th><th>Will total</th></tr></thead><tbody>'+
    ledgerRow("General Education",TY.gec,L.gec.earned,L.gec.prog,L.gec.short,L.gec.projected,DP.geLabel())+
    ledgerRow("Major in History",TY.major,L.major.earned,L.major.prog,L.major.short,L.major.projected,"42 fixed")+
    ledgerRow("General Electives",TY.electives,L.electives.earned,L.electives.prog,L.electives.needed,L.electives.target,"remainder")+
    '<tr class="ledger-total"><td>Total</td><td>120</td><td>'+t.earned+'</td><td>'+t.prog+'</td>'+
      '<td>'+t.remaining+'</td><td>120</td></tr>'+
    '</tbody></table>'+
    '<p class="ledgernote">Elective target = 120 \u2212 '+L.gec.projected+' (gen ed) \u2212 '+L.major.projected+' (major) = <strong>'+L.electives.target+'</strong>. '+
      'Student has '+L.electives.earned+', so needs <strong>'+L.electives.needed+'</strong> more.'+
      (L.closes?"":' <span class="ledgerwarn">\u26A0 These figures do not reconcile \u2014 check for a course counted in the wrong place.</span>')+
    '</p></div>';

  var G=DP.graduationCheck(stu);
  html+='<div class="card"><h3>Requirements not yet met</h3>'+
    '<p class="cardnote">The primary determination. Hours are the secondary check below.</p>';
  if(G.requirementsMet) html+='<p class="allmet">\u2713 Every requirement is met.</p>';
  G.unmet.forEach(function(u){
    html+='<div class="unmetrow"><span class="um-name">'+esc(u.label)+'</span>'+
      '<span class="um-state">'+esc(u.state.label)+'</span></div>';
  });
  html+='</div>';

  html+='<div class="card"><h3>Detail</h3>';
  if(!fl.length) html+='<p class="empty-hint">All requirements met.</p>';
  fl.forEach(function(f){
    html+='<div class="flagrow '+f.level+'"><span class="fl-tag">'+
      ({warn:"AT RISK",need:"NEEDS",watch:"PENDING",note:"NOTE"}[f.level]||f.level)+'</span>'+
      '<span class="fl-sec">'+esc(f.section)+'</span>'+
      '<span class="fl-text">'+esc(f.text)+'</span></div>';
  });
  html+='</div>';

  var ip=[];
  DP.sections().forEach(function(sec){
    (stu.courses[sec.id]||[]).forEach(function(c){
      if(DP.status(c)==="inprogress") ip.push({sec:sec.label,c:c});
    });
  });
  if(ip.length){
    html+='<div class="card"><h3>In progress \u2014 not yet earned</h3>'+
      '<p class="cardnote">These credits count toward nothing until a passing grade is posted.</p>';
    ip.forEach(function(x){
      html+='<div class="iprow"><span class="ipnum">'+esc(x.c.number)+'</span>'+
        '<span class="iptitle">'+esc(x.c.title||"")+'</span>'+
        '<span class="ipsec">'+esc(x.sec)+'</span>'+
        '<span class="ipcr">'+DP.nm(x.c.credits)+' hr</span></div>';
    });
    html+='</div>';
  }

  html+='<div class="card"><h3>Questions to raise with this student</h3>'+
    '<p class="cardnote">These appear on the exported summary.</p>';
  a.advisor.questions.forEach(function(q,i){
    html+='<div class="qrow"><input type="checkbox" data-qdone="'+i+'"'+(q.done?" checked":"")+'>'+
      '<span class="qtext'+(q.done?" done":"")+'">'+esc(q.text)+'</span>'+
      '<button class="qdel" data-qdel="'+i+'">\u00D7</button></div>';
  });
  html+='<div class="qadd"><input id="qNew" placeholder="Add a question or action item\u2026">'+
    '<button class="btnq" id="qAdd">Add</button></div></div>';

  html+='<div class="card"><div class="advisor-label">Overall advising note</div>'+
    '<textarea class="advisor" data-secnote="_overall" placeholder="This student\u2019s standing and plan\u2026">'+
    esc(a.advisor.sectionNotes["_overall"]||"")+'</textarea>'+
    (a.advisor.sectionNotes["_overall"]?'<div class="print-advisor-note">Overall: '+esc(a.advisor.sectionNotes["_overall"])+'</div>':'')+'</div>';

  document.getElementById("p-summary").innerHTML=html;
}

/* ---------- progress ---------- */
function renderProgress(){
  var a=active(), stu=a.student, html="";
  if(editMode){
    var i=stu.info;
    html+='<div class="card"><h3>Student Information</h3><div class="editinfo">'+
      ef("name","Name",i.name)+ef("bannerId","Banner ID",i.bannerId)+ef("email","Email",i.email)+
      ef("catalogYear","Catalog Year",i.catalogYear)+ef("expectedGrad","Expected Graduation",i.expectedGrad)+
      ef("gpa","GPA",i.gpa)+'</div></div>';
  }
  DP.blocks().forEach(function(block){
    var be=0,bp=0;
    block.sections.forEach(function(s){if(s.id!=="writing_int"){be+=DP.earned(stu,s.id);bp+=DP.inProgress(stu,s.id);}});
    var bLabel = block.min&&block.max&&block.min!==block.max
      ? block.min+"\u2013"+block.max : (block.dynamic ? "to reach 120" : block.total);
    var bMet = DP.blockMet(stu,block);
    html+='<div class="reqblock"><h3>'+esc(block.label)+
      '<span>'+be+' / '+bLabel+(block.dynamic?"":" hrs")+(bp?' <em>(+'+bp+' in progress)</em>':'')+
      (bMet?' \u2713':'')+'</span></h3>';
    block.sections.forEach(function(sec){
      var st=DP.sectionState(stu,sec), rows=stu.courses[sec.id]||[], waived=!!stu.waived[sec.id];
      var ov=DP.override(stu,sec.id);
      html+='<div class="section"><div class="section-head"><span class="sname">'+esc(sec.label)+'</span>'+
        '<span class="snote">'+esc(sec.note||"")+'</span>'+
        '<span class="status '+st.cls+(ov?" ovr":"")+'">'+st.label+'</span>'+
        '<button class="ovbtn'+(ov?" on":"")+'" data-ov="'+sec.id+'" title="'+(ov?"Edit or remove this override":"Mark this requirement met")+'">'+
          (ov?"\u270E override":"Mark met")+'</button>'+
        '</div>';
      if(ov){
        html+='<div class="ovnote"><span class="ovlbl">Advisor override</span>'+
          esc(ov.reason||"No reason recorded.")+
          '<em>'+esc([ov.by,ov.date].filter(Boolean).join(" \u00B7 "))+'</em></div>';
      }
      if(sec.waivable&&editMode)
        html+='<div class="waive-row"><label><input type="checkbox" data-waive="'+sec.id+'"'+(waived?" checked":"")+'> Waived</label></div>';
      if(sec.rule==="groups"&&!waived){
        html+='<div class="grouphint">';
        sec.groups.forEach(function(g){
          var has=(st.groups||[]).indexOf(g)>-1;
          var pr=!has&&(st.groupsProg||[]).indexOf(g)>-1;
          html+='<span class="gchip'+(has?" on":(pr?" prog":""))+'">'+(has?"\u2713 ":(pr?"\u25CB ":""))+esc(g)+'</span>';
        });
        html+='<span class="ghelp">Any two of these three</span></div>';
      }
      if(!waived){
        html+='<table class="courses"><tbody>';
        rows.forEach(function(c,ci){
          var cst=DP.status(c), valid=DP.validPlacement(sec,c);
          var rc="crow "+(valid===false?"misplaced":cst);
          var ck=sec.id+":"+ci, cm=a.advisor.comments[ck];
          if(editMode){
            html+='<tr class="'+rc+'" data-sec="'+sec.id+'" data-i="'+ci+'">'+
              '<td style="width:13%"><input class="e-number" value="'+esc(c.number)+'"></td>'+
              '<td style="width:29%"><input class="e-title" value="'+esc(c.title)+'"></td>'+
              '<td style="width:7%"><input class="e-credits" value="'+esc(c.credits)+'"></td>'+
              '<td style="width:8%"><input class="e-grade" value="'+esc(c.grade)+'" placeholder="\u2014"></td>'+
              '<td style="width:11%"><input class="e-semester" value="'+esc(c.semester)+'"></td>'+
              '<td style="width:13%"><label class="ipbox"><input type="checkbox" class="e-ip"'+(cst==="inprogress"?" checked":"")+'> In prog</label></td>'+
              '<td style="width:4%"><button class="rowdel" data-rowdel="1">\u00D7</button></td></tr>';
          } else {
            html+='<tr class="'+rc+'">'+
              '<td class="cnum" style="width:13%">'+esc(c.number||"\u2014")+'</td>'+
              '<td style="width:31%">'+esc(c.title||"")+'</td>'+
              '<td style="width:6%">'+esc(c.credits||"")+'</td>'+
              '<td style="width:9%">'+(cst==="inprogress"?'<span class="ipbadge">IN PROG</span>':esc(c.grade||"\u2014"))+'</td>'+
              '<td style="width:10%">'+esc(c.semester||"")+'</td>'+
              '<td style="width:14%" class="cnote">'+esc(c.notes||"")+'</td>'+
              '<td style="width:11%;text-align:right"><button class="commentbtn'+(cm?" has":"")+'" data-comment="'+ck+'" data-ctx="'+esc((c.number||"")+" "+(c.title||""))+'">'+(cm?"\u270E":"+")+'</button></td></tr>';
            if(cm) html+='<tr><td colspan="7"><div class="inline-comment"><span class="lbl">Advisor</span> '+esc(cm)+'</div></td></tr>';
          }
          if(valid===false) html+='<tr><td colspan="7"><div class="flagline">\u26A0 May not satisfy '+esc(sec.label)+' \u2014 verify placement.</div></td></tr>';
        });
        if(!rows.length&&!editMode) html+='<tr><td colspan="7" class="norows">No courses.</td></tr>';
        html+='</tbody></table>';
        if(editMode) html+='<button class="addrow" data-addrow="'+sec.id+'">+ Add course</button>';
      }
      var sn=a.advisor.sectionNotes[sec.id]||"";
      html+='<div class="notewrap"><div class="advisor-label">Section note</div>'+
        '<textarea class="advisor" data-secnote="'+sec.id+'"></textarea></div>';
      html=html.replace('<textarea class="advisor" data-secnote="'+sec.id+'"></textarea>',
                        '<textarea class="advisor" data-secnote="'+sec.id+'">'+esc(sn)+'</textarea>');
      if(sn) html+='<div class="print-advisor-note">Advisor \u2014 '+esc(sec.label)+': '+esc(sn)+'</div>';
      html+='</div>';
    });
    html+='</div>';
  });
  if(stu.failed&&stu.failed.length){
    html+='<div class="reqblock"><h3>Failed / Insufficient<span>'+stu.failed.length+'</span></h3><table class="courses"><tbody>';
    stu.failed.forEach(function(f){
      html+='<tr class="crow failed"><td class="cnum" style="width:14%">'+esc(f.number)+'</td>'+
        '<td>'+esc(f.title||"")+'</td><td style="width:14%">'+esc(f.term||"")+'</td></tr>';
    });
    html+='</tbody></table></div>';
  }
  document.getElementById("p-progress").innerHTML=html;
}
function ef(k,l,v){return '<div class="fld"><label>'+l+'</label><input data-einfo="'+k+'" value="'+esc(v||"")+'"></div>';}

function renderGoals(){
  var g=active().student.goals||{};
  var F=[["whyHistory","Why history?"],["career","Career aspirations"],["gradSchool","Graduate school"],["skills","Skills to build"],["other","Notes for advisor"]];
  var h='<div class="card"><h3>Student\u2019s Stated Goals</h3>';
  F.forEach(function(f){
    var v=g[f[0]];
    h+='<div class="readfield"><div class="rl">'+esc(f[1])+'</div><div class="rv'+(v?"":" empty")+'">'+(v?esc(v):"Not provided")+'</div></div>';
  });
  var n=active().advisor.sectionNotes["_goals"]||"";
  h+='</div><div class="card"><div class="advisor-label">Advisor notes on goals</div>'+
    '<textarea class="advisor" data-secnote="_goals">'+esc(n)+'</textarea>'+
    (n?'<div class="print-advisor-note">Advisor: '+esc(n)+'</div>':'')+'</div>';
  document.getElementById("p-goals").innerHTML=h;
}
function renderInternships(){
  var L=active().student.internships||[], h="";
  if(!L.length) h='<p class="empty-hint">No internships recorded by the student.</p>';
  L.forEach(function(it){
    h+='<div class="intern-read"><div><span class="ih">'+esc(it.org||"Untitled")+'</span>'+
      (it.status?'<span class="is">'+esc(it.status)+'</span>':'')+'</div>'+
      '<div class="id">'+[it.role,it.term,(it.hours?it.hours+" hrs":"")].filter(Boolean).map(esc).join(" \u00B7 ")+'</div>'+
      (it.notes?'<div class="inote">'+esc(it.notes)+'</div>':'')+'</div>';
  });
  var n=active().advisor.sectionNotes["_internships"]||"";
  h+='<div class="card"><div class="advisor-label">Advisor notes on opportunities</div>'+
    '<textarea class="advisor" data-secnote="_internships">'+esc(n)+'</textarea>'+
    (n?'<div class="print-advisor-note">Advisor: '+esc(n)+'</div>':'')+'</div>';
  document.getElementById("p-internships").innerHTML=h;
}
function renderMeetings(){
  var a=active(), today=new Date().toISOString().slice(0,10);
  var h='<div class="addmeeting"><div class="fld" style="flex:0 0 150px"><label>Date</label>'+
    '<input type="date" id="mDate" value="'+today+'"></div>'+
    '<div class="fld"><label>What was discussed</label><textarea id="mBody"></textarea></div>'+
    '<button class="bigbtn" id="addMeeting" style="padding:10px 18px;font-size:.85rem">Log Meeting</button></div>';
  if(!a.advisor.meetings.length) h+='<p class="empty-hint">No meetings logged yet.</p>';
  a.advisor.meetings.slice().sort(function(x,y){return (y.date||"").localeCompare(x.date||"");}).forEach(function(m){
    h+='<div class="meeting"><div class="mh"><span class="mdate">'+esc(m.date||"")+'</span>'+
      '<button class="mdel" data-delmeeting="'+m.id+'">\u00D7</button></div>'+
      '<div class="mbody">'+esc(m.body)+'</div></div>';
  });
  document.getElementById("p-meetings").innerHTML=h;
}

/* ---------- wiring ---------- */
function wire(){
  var main=document.getElementById("main");
  document.getElementById("tabbar").addEventListener("click",function(e){
    var t=e.target.closest(".tab");if(!t)return;
    document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("active");});
    t.classList.add("active");
    document.querySelectorAll(".panel").forEach(function(p){p.classList.remove("active");});
    document.getElementById("p-"+t.getAttribute("data-tab")).classList.add("active");
  });
  document.getElementById("bEdit").addEventListener("click",function(){editMode=!editMode;renderMain();});
  document.getElementById("bRemove").addEventListener("click",function(){
    var a=active(), nm=a.student.info.name||"this student";
    var notes=Object.keys(a.advisor.comments).length
            + Object.keys(a.advisor.sectionNotes).filter(function(k){return a.advisor.sectionNotes[k];}).length
            + a.advisor.meetings.length + a.advisor.questions.length;
    var msg="Remove "+nm+" from your caseload?";
    if(notes) msg+="\n\nThis permanently deletes "+notes+" advising item(s) \u2014 comments, section notes, questions, and meeting log entries. This cannot be undone.";
    msg+="\n\n(Their own Degree Path file is not affected.)";
    if(!confirm(msg)) return;
    caseload.advisees=caseload.advisees.filter(function(x){return x.id!==activeId;});
    activeId=caseload.advisees.length?caseload.advisees[0].id:null;
    editMode=false;
    save();renderRoster();renderMain();
  });
  document.getElementById("bPdfIn").addEventListener("click",function(){importPdf(activeId);});
  document.getElementById("bPdfOut").addEventListener("click",exportPdf);
  document.getElementById("bXls").addEventListener("click",exportXlsx);

  main.addEventListener("input",function(e){
    var sn=e.target.getAttribute("data-secnote");
    if(sn!=null){active().advisor.sectionNotes[sn]=e.target.value;save();return;}
    var ei=e.target.getAttribute("data-einfo");
    if(ei){active().student.info[ei]=e.target.value;save();renderRoster();return;}
    var tr=e.target.closest("tr[data-sec]");
    if(!tr)return;
    var sec=tr.getAttribute("data-sec"),i=+tr.getAttribute("data-i");
    var row=active().student.courses[sec][i];if(!row)return;
    var cl=e.target.className;
    if(cl.indexOf("e-number")>-1){
      row.number=e.target.value;
      var f=DP.findCourse(row.number)||DP.geCourse(row.number);
      if(f){
        var t=tr.querySelector(".e-title"),cr=tr.querySelector(".e-credits");
        if(!row.title){row.title=f.title;t.value=f.title;}
        if(!row.credits&&f.credits){row.credits=f.credits;cr.value=f.credits;}
      }
    }
    else if(cl.indexOf("e-title")>-1)row.title=e.target.value;
    else if(cl.indexOf("e-credits")>-1)row.credits=e.target.value;
    else if(cl.indexOf("e-grade")>-1)row.grade=e.target.value;
    else if(cl.indexOf("e-semester")>-1)row.semester=e.target.value;
    save();
    var st=DP.status(row), v=DP.validPlacement(DP.sectionOf(sec),row);
    tr.className="crow "+(v===false?"misplaced":st);
    renderSummary();renderRoster();
  });
  main.addEventListener("change",function(e){
    if(e.target.className.indexOf("e-ip")>-1){
      var tr=e.target.closest("tr[data-sec]");
      var row=active().student.courses[tr.getAttribute("data-sec")][+tr.getAttribute("data-i")];
      row.inProgress=e.target.checked;
      if(row.inProgress){row.grade="";row.notes="Registered \u2014 not yet earned";}
      save();renderMain();return;
    }
    var w=e.target.getAttribute("data-waive");
    if(w!=null&&e.target.type==="checkbox"){
      active().student.waived[w]=e.target.checked;save();renderMain();return;
    }
    var qd=e.target.getAttribute("data-qdone");
    if(qd!=null){active().advisor.questions[+qd].done=e.target.checked;save();renderSummary();}
  });
  main.addEventListener("click",function(e){
    var ar=e.target.closest("[data-addrow]");
    if(ar){
      var s=ar.getAttribute("data-addrow");
      active().student.courses[s].push({number:"",title:"",credits:"",grade:"",semester:"",notes:""});
      save();renderProgress();
      var rs=document.querySelectorAll('tr[data-sec="'+s+'"]');
      if(rs.length)rs[rs.length-1].querySelector(".e-number").focus();
      return;
    }
    var rd=e.target.closest("[data-rowdel]");
    if(rd){
      var tr=rd.closest("tr[data-sec]");
      active().student.courses[tr.getAttribute("data-sec")].splice(+tr.getAttribute("data-i"),1);
      save();renderMain();return;
    }
    var cb=e.target.closest("[data-comment]");
    if(cb){openComment(cb.getAttribute("data-comment"),cb.getAttribute("data-ctx"));return;}
    var ob=e.target.closest("[data-ov]");
    if(ob){openOverride(ob.getAttribute("data-ov"));return;}
    if(e.target.id==="qAdd"){
      var v=document.getElementById("qNew").value.trim();
      if(v){active().advisor.questions.push({text:v,done:false});save();renderSummary();}
      return;
    }
    var qx=e.target.getAttribute("data-qdel");
    if(qx!=null){active().advisor.questions.splice(+qx,1);save();renderSummary();return;}
    if(e.target.closest("#addMeeting")){
      var d=document.getElementById("mDate").value,b=document.getElementById("mBody").value.trim();
      if(!b){alert("Enter what was discussed.");return;}
      active().advisor.meetings.push({id:uid(),date:d,body:b});
      save();renderMeetings();document.getElementById("mcnt").textContent=active().advisor.meetings.length;
      return;
    }
    var dm=e.target.closest("[data-delmeeting]");
    if(dm){
      var id=dm.getAttribute("data-delmeeting");
      active().advisor.meetings=active().advisor.meetings.filter(function(m){return m.id!==id;});
      save();renderMeetings();document.getElementById("mcnt").textContent=active().advisor.meetings.length||"";
    }
  });
  main.addEventListener("keydown",function(e){
    if(e.key==="Enter"&&e.target.id==="qNew"){e.preventDefault();document.getElementById("qAdd").click();}
  });
}

/* ---------- advisor override ---------- */
var pendOv=null;
function openOverride(secId){
  pendOv=secId;
  var sec=DP.sectionOf(secId);
  var a=active();
  var ov=(a.student.overrides||{})[secId];
  var st=DP.sectionState(a.student,sec);
  document.getElementById("ovSection").textContent=sec.label;
  document.getElementById("ovCurrent").textContent=ov
    ? "Currently overridden."
    : "The tool reads this as: "+st.label.replace(/^\u2713\s*/,"");
  document.getElementById("ovReason").value=ov?(ov.reason||""):"";
  document.getElementById("ovRemove").style.display=ov?"":"none";
  document.getElementById("ovModal").classList.add("show");
  document.getElementById("ovReason").focus();
}
document.getElementById("ovSave").addEventListener("click",function(){
  var reason=document.getElementById("ovReason").value.trim();
  if(!reason){ alert("Record why this requirement is met. The reason goes on the advising summary."); return; }
  var a=active();
  a.student.overrides=a.student.overrides||{};
  a.student.overrides[pendOv]={
    reason:reason,
    by:(a.student.info.advisor||"Advisor"),
    date:new Date().toISOString().slice(0,10)
  };
  save();document.getElementById("ovModal").classList.remove("show");renderMain();
});
document.getElementById("ovRemove").addEventListener("click",function(){
  var a=active();
  if(a.student.overrides) delete a.student.overrides[pendOv];
  save();document.getElementById("ovModal").classList.remove("show");renderMain();
});
document.getElementById("ovCancel").addEventListener("click",function(){
  document.getElementById("ovModal").classList.remove("show");
});
document.getElementById("ovModal").addEventListener("mousedown",function(e){
  if(e.target===this) this.classList.remove("show");
});

/* ---------- comment modal ---------- */
var pend=null;
function openComment(k,ctx){
  pend=k;
  document.getElementById("modalCtx").textContent=ctx;
  document.getElementById("modalText").value=active().advisor.comments[k]||"";
  document.getElementById("modal").classList.add("show");
  document.getElementById("modalText").focus();
}
document.getElementById("modalSave").addEventListener("click",function(){
  var v=document.getElementById("modalText").value.trim();
  if(v)active().advisor.comments[pend]=v; else delete active().advisor.comments[pend];
  save();document.getElementById("modal").classList.remove("show");renderProgress();
});
document.getElementById("modalCancel").addEventListener("click",function(){document.getElementById("modal").classList.remove("show");});
document.getElementById("modal").addEventListener("mousedown",function(e){if(e.target===this)this.classList.remove("show");});
document.addEventListener("keydown",function(e){if(e.key==="Escape")document.getElementById("modal").classList.remove("show");});

/* ---------- PDF import ---------- */
function importPdf(intoId){
  if(!caseload){alert("Create or open a caseload file first.");return;}
  window.ac.importPdf().then(function(r){
    if(!r.ok){if(r.error)alert(r.error);return;}
    DP.readPdf(new Uint8Array(r.buffer).buffer).then(function(text){
      var p=DP.parseAudit(text);
      var n=0;Object.keys(p.courses).forEach(function(k){n+=p.courses[k].length;});
      if(!n){alert("No courses found. Is this a DegreeWorks audit PDF?");return;}
      var target=null;
      if(intoId) target=caseload.advisees.find(function(x){return x.id===intoId;});
      else {
        var ex=caseload.advisees.find(function(x){
          return p.info.bannerId&&x.student.info.bannerId===p.info.bannerId;});
        if(ex&&confirm(ex.student.info.name+" is already in your caseload. Refresh their audit and keep your notes?")) target=ex;
      }
      if(!target){
        target={id:uid(),student:blankStudent(),advisor:{comments:{},meetings:[],sectionNotes:{},questions:[]}};
        caseload.advisees.push(target);
      }
      var keepOv=target.student.overrides||{};
      target.student.courses=p.courses;
      target.student.waived=p.waived||{};
      target.student.overrides=keepOv;
      target.student.failed=p.failed||[];
      Object.keys(p.info).forEach(function(k){if(p.info[k])target.student.info[k]=p.info[k];});
      normalize(target);
      activeId=target.id;editMode=false;
      save();renderRoster();renderMain();
      var ipn=0;
      Object.keys(p.courses).forEach(function(k){
        p.courses[k].forEach(function(c){if(c.inProgress)ipn++;});
      });
      var msg="Imported "+n+" courses.\n"+ipn+" are in progress (not yet earned).";
      if(p.failed.length) msg+="\n"+p.failed.length+" failed course(s) recorded separately.";
      if(p.moved && p.moved.length){
        msg+="\n\nRe-placed "+p.moved.length+" course(s) the audit had filed under a requirement they cannot satisfy:\n";
        p.moved.slice(0,8).forEach(function(m){ msg+="  \u2022 "+m.number+": "+m.from+" \u2192 "+m.to+"\n"; });
        if(p.moved.length>8) msg+="  \u2026 and "+(p.moved.length-8)+" more.\n";
        msg+="\nReview these on the Degree Progress tab.";
      }
      alert(msg);
    }).catch(function(e){alert("Could not read that PDF: "+e.message);});
  });
}
function newStudent(){
  if(!caseload){alert("Create or open a caseload file first.");return;}
  var a={id:uid(),student:blankStudent(),advisor:{comments:{},meetings:[],sectionNotes:{},questions:[]}};
  normalize(a);caseload.advisees.push(a);activeId=a.id;editMode=true;
  save();renderRoster();renderMain();
}

/* ---------- exports ---------- */
function exportPdf(){
  var n=(active().student.info.name||"student").toLowerCase().replace(/[^a-z0-9]+/g,"-");
  document.body.classList.add("printing");
  document.querySelectorAll(".panel").forEach(function(p){p.classList.add("active");});
  setTimeout(function(){
    window.ac.exportPdf("advising-summary-"+n+".pdf").then(function(r){
      document.body.classList.remove("printing");
      document.querySelectorAll(".panel").forEach(function(p,i){p.classList.toggle("active",i===0);});
      document.querySelectorAll(".tab").forEach(function(t,i){t.classList.toggle("active",i===0);});
      if(r.ok)alert("Saved to "+r.path);
      else if(r.error)alert("Export failed: "+r.error);
    });
  },150);
}

function exportXlsx(){
  var a=active(), stu=a.student, t=DP.totals(stu);
  var wb=XLSX.utils.book_new();

  var s1=[["NCCU Department of History \u2014 Advising Summary"],[],
    ["Student",stu.info.name||""],["Banner ID",stu.info.bannerId||""],
    ["Catalog Year",(stu.info.catalogYear||"NOT SET")+"  \u2190 verify against actual catalog"],
    ["GPA",stu.info.gpa||""],["Last Term",stu.info.lastTerm||""],
    ["Generated",new Date().toLocaleDateString()],[],
    ["CREDIT STANDING"],["","Earned","In Progress","Required"],
    ["TOTAL",t.earned,t.prog,120]];
  DP.blocks().forEach(function(b){
    var x=t.byBlock[b.label];
    s1.push([b.label,x.earned,x.prog,x.total]);
  });
  s1.push([],["Note: 'In Progress' credits are registered but NOT earned. They count toward nothing until a passing grade posts."]);
  s1.push([],["WHAT THIS STUDENT NEEDS"],["Level","Requirement","Detail"]);
  DP.flags(stu).forEach(function(f){
    s1.push([{warn:"AT RISK",need:"NEEDS",watch:"PENDING",note:"NOTE"}[f.level]||f.level,f.section,f.text]);
  });
  s1.push([],["QUESTIONS FOR THE STUDENT"]);
  if(!a.advisor.questions.length) s1.push(["(none recorded)"]);
  a.advisor.questions.forEach(function(q){s1.push([q.done?"[done]":"[ ]",q.text]);});
  if(a.advisor.sectionNotes["_overall"]) s1.push([],["OVERALL ADVISING NOTE"],[a.advisor.sectionNotes["_overall"]]);
  var ws1=XLSX.utils.aoa_to_sheet(s1);
  ws1["!cols"]=[{wch:28},{wch:32},{wch:78}];
  XLSX.utils.book_append_sheet(wb,ws1,"Summary");

  var s2=[["Requirement","Course","Title","Hrs","Grade","Status","Term","Advisor Comment"]];
  DP.sections().forEach(function(sec){
    (stu.courses[sec.id]||[]).forEach(function(c,i){
      var st=DP.status(c);
      s2.push([sec.label,c.number||"",c.title||"",DP.nm(c.credits),
        st==="inprogress"?"":(c.grade||""),
        {complete:"Earned",inprogress:"IN PROGRESS - not earned",planned:"Planned",failed:"Failed"}[st],
        c.semester||"",a.advisor.comments[sec.id+":"+i]||""]);
    });
  });
  (stu.failed||[]).forEach(function(f){
    s2.push(["Failed / Insufficient",f.number,f.title||"",0,"F","Failed",f.term||"",""]);
  });
  var ws2=XLSX.utils.aoa_to_sheet(s2);
  ws2["!cols"]=[{wch:28},{wch:12},{wch:40},{wch:6},{wch:7},{wch:24},{wch:10},{wch:48}];
  XLSX.utils.book_append_sheet(wb,ws2,"Courses");

  var s3=[["Date","Discussion"]];
  a.advisor.meetings.slice().sort(function(x,y){return (x.date||"").localeCompare(y.date||"");})
    .forEach(function(m){s3.push([m.date||"",m.body||""]);});
  var ws3=XLSX.utils.aoa_to_sheet(s3);
  ws3["!cols"]=[{wch:12},{wch:110}];
  XLSX.utils.book_append_sheet(wb,ws3,"Meeting Log");

  var out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  var nm=(stu.info.name||"student").toLowerCase().replace(/[^a-z0-9]+/g,"-");
  window.ac.exportXlsx({suggestedName:"advising-summary-"+nm+".xlsx",buffer:Array.from(new Uint8Array(out))})
    .then(function(r){if(r.ok)alert("Saved to "+r.path);else if(r.error)alert("Export failed: "+r.error);});
}

/* ---------- caseload ---------- */
function afterOpen(r){
  if(!r||!r.ok){if(r&&r.error)alert(r.error);return;}
  caseload=r.data;filePath=r.path;
  caseload.advisees=caseload.advisees||[];
  caseload.advisees.forEach(normalize);
  activeId=caseload.advisees.length?caseload.advisees[0].id:null;
  setStatus("saved");renderRoster();renderMain();
}
document.getElementById("btnImportPdf").addEventListener("click",function(){importPdf(null);});
document.getElementById("btnImportStudent").addEventListener("click",function(){
  if(!caseload){alert("Create or open a caseload file first.");return;}
  window.ac.importStudent().then(function(r){
    if(!r.ok){if(r.error)alert(r.error);return;}
    /* Full backup file written by "Save This Student as a File": restore the
       student record AND advisor notes. */
    if(r.advisee){
      var adv=r.advisee, info=(adv.student&&adv.student.info)||{};
      var exB=caseload.advisees.find(function(x){
        return (info.bannerId&&x.student.info.bannerId===info.bannerId)||
               (info.name&&x.student.info.name===info.name);});
      if(exB&&!confirm(info.name+" is already in your caseload. Replace their record (including notes) from this file?"))return;
      if(exB){ exB.student=adv.student; exB.advisor=adv.advisor||exB.advisor; normalize(exB); activeId=exB.id; }
      else { var naB={id:uid(),student:adv.student,advisor:adv.advisor||{comments:{},meetings:[],sectionNotes:{},questions:[]}}; normalize(naB); caseload.advisees.push(naB); activeId=naB.id; }
      save();renderRoster();renderMain();return;
    }
    var d=r.data;
    var stu=Object.assign(blankStudent(),{info:d.info,courses:d.courses,waived:d.waived||{},
      goals:d.goals||{},internships:d.internships||[],communityHours:d.communityHours||""});
    var ex=caseload.advisees.find(function(x){
      return (d.info.bannerId&&x.student.info.bannerId===d.info.bannerId)||
             (d.info.name&&x.student.info.name===d.info.name);});
    if(ex&&confirm(ex.student.info.name+" is already in your caseload. Update and keep your notes?")){
      ex.student=stu;normalize(ex);activeId=ex.id;
    } else {
      var na={id:uid(),student:stu,advisor:{comments:{},meetings:[],sectionNotes:{},questions:[]}};
      normalize(na);caseload.advisees.push(na);activeId=na.id;
    }
    save();renderRoster();renderMain();
  });
});
document.getElementById("btnNewStudent").addEventListener("click",newStudent);
document.getElementById("btnReveal").addEventListener("click",function(){window.ac.revealCaseload();});
document.getElementById("btnSaveStudent").addEventListener("click",function(){
  if(!caseload||!active()){alert("Open a student first, then save them as a file.");return;}
  var a=active();
  var nm=(a.student.info.name||"student").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  var out={_kind:"nccu-advisee",_saved:new Date().toISOString(),student:a.student,advisor:a.advisor};
  window.ac.exportStudent({suggestedName:nm+".json",data:out}).then(function(r){
    if(r.ok)alert("Saved this student as their own file:\n\n"+r.path+"\n\nThis file is also a backup \u2014 you can bring it back later with \u201CImport Student File.\u201D");
    else if(r.error)alert("Save failed: "+r.error);
  });
});
document.getElementById("btnSaveNow").addEventListener("click",function(){
  if(!caseload){alert("No caseload file is open yet.\n\nClick \u201CCreate Caseload File\u201D (or \u201COpen Other Caseload\u201D) first \u2014 then your work has somewhere to save to.");return;}
  clearTimeout(saveTimer);
  setStatus("saving");
  window.ac.writeCaseload(caseload).then(function(r){
    pendingSave=!r.ok;
    if(r.ok){ setStatus("saved"); alert("Saved.\n\n"+(r.path||filePath||"")); }
    else { setStatus("error", r.error); alert("Save FAILED.\n\n"+(r.error||"Unknown error.")+"\n\nTell Claude exactly what this says."); }
  });
});
document.getElementById("btnSwitch").addEventListener("click",function(){window.ac.openCaseload().then(afterOpen);});
document.getElementById("roster").addEventListener("click",function(e){
  var b=e.target.closest("[data-id]");if(!b)return;
  activeId=b.getAttribute("data-id");editMode=false;renderRoster();renderMain();
});

window.ac.startup().then(function(r){
  if(r.ok) afterOpen(r);
  else { renderMain(); document.getElementById("fileStatus").innerHTML=""; }
});
})();
