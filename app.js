var STORAGE_KEY = 'balance_sheet_data';
var defaultData = {assets:[],liabilities:[],loans:[],incomes:[],theme:'light'};
var currencySymbols={CNY:'¥',USD:'$',EUR:'€',GBP:'£',JPY:'¥',HKD:'HK$',USDT:'₮'};
var currencyLabels={CNY:'人民币',USD:'美元',EUR:'欧元',GBP:'英镑',JPY:'日元',HKD:'港币',USDT:'USDT'};

var defaultRates={CNY:1,USD:7.25,EUR:7.85,GBP:9.15,JPY:0.048,HKD:0.93,USDT:7.25};
var exchangeRates=Object.assign({},defaultRates);
var ratesUpdateTime='使用默认汇率';

function loadData(){
  try{var d=JSON.parse(localStorage.getItem(STORAGE_KEY));return d?Object.assign({},defaultData,d):Object.assign({},defaultData)}
  catch(e){return Object.assign({},defaultData)}
}
function saveStore(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}

var data = loadData();
if(!data.incomes) data.incomes=[];

var assetCategories=['现金及银行存款','货币基金','基金投资','股票投资','数字货币','理财产品','借出款','固定资产','其他资产'];
var liabilityCategories=['信用卡欠款','借入款','房贷','车贷','消费贷','其他负债'];
var pageTitles={dashboard:'📊 仪表盘',assets:'📈 资产管理',liabilities:'📉 负债管理',loans:'🏦 借出款管理',incomes:'💼 主动收入',settings:'⚙️ 数据管理'};
var rateTypeLabels={year:'年利率',month:'月利率',day:'日利率'};

function fetchExchangeRates(){
  fetch('https://api.exchangerate-api.com/v4/latest/CNY')
    .then(function(r){return r.json()})
    .then(function(d){
      if(d&&d.rates){
        var r=d.rates;
        exchangeRates.CNY=1;
        if(r.USD) exchangeRates.USD=1/r.USD;
        if(r.EUR) exchangeRates.EUR=1/r.EUR;
        if(r.GBP) exchangeRates.GBP=1/r.GBP;
        if(r.JPY) exchangeRates.JPY=1/r.JPY;
        if(r.HKD) exchangeRates.HKD=1/r.HKD;
        exchangeRates.USDT=exchangeRates.USD;
        ratesUpdateTime='实时汇率 · '+new Date().toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
        updateRatesDisplay();refreshAll();
      }
    })
    .catch(function(){
      fetch('https://open.er-api.com/v6/latest/CNY')
        .then(function(r){return r.json()})
        .then(function(d){
          if(d&&d.rates){
            var r=d.rates;exchangeRates.CNY=1;
            if(r.USD) exchangeRates.USD=1/r.USD;
            if(r.EUR) exchangeRates.EUR=1/r.EUR;
            if(r.GBP) exchangeRates.GBP=1/r.GBP;
            if(r.JPY) exchangeRates.JPY=1/r.JPY;
            if(r.HKD) exchangeRates.HKD=1/r.HKD;
            exchangeRates.USDT=exchangeRates.USD;
            ratesUpdateTime='实时汇率 · '+new Date().toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
            updateRatesDisplay();refreshAll();
          }
        }).catch(function(){ratesUpdateTime='离线默认汇率';updateRatesDisplay()});
    });
}

function updateRatesDisplay(){
  var el=document.getElementById('ratesInfo');
  if(el){
    var parts=[];
    Object.keys(exchangeRates).forEach(function(k){if(k!=='CNY') parts.push(currencyLabels[k]+': 1=¥'+exchangeRates[k].toFixed(4))});
    el.textContent=ratesUpdateTime+' | '+parts.join(' · ');
  }
}

function toCNY(amount,currency){return amount*(exchangeRates[currency||'CNY']||1)}

document.querySelectorAll('.nav-item,.mob-item').forEach(function(el){
  el.addEventListener('click',function(){switchPage(el.dataset.page)});
});

function switchPage(page){
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active')});
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.toggle('active',n.dataset.page===page)});
  document.querySelectorAll('.mob-item').forEach(function(n){n.classList.toggle('active',n.dataset.page===page)});
  document.getElementById('mobileTitle').textContent=pageTitles[page]||page;
  if(page==='dashboard') refreshDashboard();
}

function toggleTheme(){data.theme=data.theme==='dark'?'light':'dark';applyTheme();saveStore()}
function applyTheme(){document.body.classList.toggle('dark',data.theme==='dark')}
applyTheme();

function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function fmt(n,cur){var s=currencySymbols[cur]||'¥';return s+Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtCNY(n){return '¥'+Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}

// 借出款利息计算：优先用手动已收期数，否则按还款日自动算
function calcLoanInterest(loan){
  var start=new Date(loan.startDate),now=new Date();
  var days=Math.max(0,Math.floor((now-start)/86400000));
  var rateType=loan.rateType||'year';

  // 日利率特殊处理
  if(rateType==='day'){
    var paidP=loan.paidPeriods;
    var useDays=(paidP!=null&&paidP!==''&&paidP>=0)?paidP:days;
    return {days:days,periods:useDays,interest:loan.principal*(loan.rate/100)*useDays,unit:'day'};
  }

  // 月/年利率：计算期数
  var periods=0;
  var paidPeriods=loan.paidPeriods;

  if(paidPeriods!=null&&paidPeriods!==''&&paidPeriods>=0){
    // 手动输入优先
    periods=parseInt(paidPeriods);
  } else if(loan.repayDay&&loan.startDate){
    // 按还款日自动计算完整周期数
    var repayDay=parseInt(loan.repayDay);
    var y=start.getFullYear(),m=start.getMonth();
    // 找到第一个还款日
    var firstRepay=new Date(y,m,repayDay);
    if(firstRepay<=start){
      // 起始日在还款日当天或之后，第一个还款日是下个月
      m++;
      firstRepay=new Date(y,m,repayDay);
    }
    // 从第一个还款日开始数完整周期
    periods=0;
    var checkDate=new Date(firstRepay);
    while(checkDate<=now){
      periods++;
      checkDate=new Date(firstRepay.getFullYear(),firstRepay.getMonth()+periods,repayDay);
    }
  } else {
    // 无还款日，按旧逻辑
    periods=(now.getFullYear()-start.getFullYear())*12+(now.getMonth()-start.getMonth());
    if(periods<0) periods=0;
    periods+=1;
  }

  var monthlyRate=rateType==='month'?(loan.rate/100):(loan.rate/100/12);
  return {days:days,periods:periods,interest:loan.principal*monthlyRate*periods,unit:'month'};
}

function calcRemainingDebt(l){
  var td=l.totalDebt||0,mp=l.monthlyPrincipal||0,paid=l.paidPeriods||0;
  return (td>0&&mp>0)?Math.max(0,td-mp*paid):td;
}

function openModal(type, id){
  document.getElementById('itemType').value=type;
  var isLoan=type==='loan',isLiab=type==='liability',isAsset=type==='asset',isIncome=type==='income';

  document.getElementById('fieldsGeneral').style.display=(isLoan||isIncome)?'none':'';
  document.getElementById('fieldsLoan').style.display=isLoan?'':'none';
  document.getElementById('fieldsLiabilityExtra').style.display=isLiab?'':'none';
  document.getElementById('fieldAmountGroup').style.display=isLiab?'none':'';
  document.getElementById('fieldsAssetExtra').style.display=isAsset?'':'none';
  document.getElementById('fieldsIncome').style.display=isIncome?'':'none';

  document.getElementById('fieldName').required=(!isLoan&&!isIncome);
  document.getElementById('fieldAmount').required=(!isLoan&&!isLiab&&!isIncome);
  document.getElementById('loanBorrower').required=isLoan;
  document.getElementById('loanPrincipal').required=isLoan;
  document.getElementById('loanStartDate').required=isLoan;

  if(isAsset){
    document.getElementById('modalTitle').textContent=id?'编辑资产':'添加资产';
    document.getElementById('fieldAmount').required=true;
    populateCats(assetCategories);
  } else if(isLiab){
    document.getElementById('modalTitle').textContent=id?'编辑负债':'添加负债';
    document.getElementById('fieldAmount').required=false;
    populateCats(liabilityCategories);
  } else if(isIncome){
    document.getElementById('modalTitle').textContent=id?'编辑收入':'添加收入';
  } else {
    document.getElementById('modalTitle').textContent=id?'编辑借出款':'添加借出款';
  }

  if(id){
    document.getElementById('itemId').value=id;
    if(isLoan){
      var item=data.loans.find(function(l){return l.id===id});
      if(item){
        document.getElementById('loanBorrower').value=item.borrower||'';
        document.getElementById('loanPrincipal').value=item.principal||'';
        document.getElementById('loanRate').value=item.rate||'';
        document.getElementById('loanRateType').value=item.rateType||'year';
        document.getElementById('loanStartDate').value=item.startDate||'';
        document.getElementById('loanRepayDay').value=item.repayDay||'';
        document.getElementById('loanPaidPeriods').value=(item.paidPeriods!=null&&item.paidPeriods!=='')?item.paidPeriods:'';
        document.getElementById('loanNote').value=item.note||'';
      }
    } else if(isIncome){
      var inc=data.incomes.find(function(i){return i.id===id});
      if(inc){
        document.getElementById('incomeCategory').value=inc.category||'';
        document.getElementById('incomeName').value=inc.name||'';
        document.getElementById('incomeAmount').value=inc.amount||'';
        document.getElementById('incomeNote').value=inc.note||'';
      }
    } else {
      var list=isAsset?data.assets:data.liabilities;
      var found=list.find(function(i){return i.id===id});
      if(found){
        document.getElementById('fieldCategory').value=found.category||'';
        document.getElementById('fieldName').value=found.name||'';
        document.getElementById('fieldAmount').value=found.amount||'';
        document.getElementById('fieldCurrency').value=found.currency||'CNY';
        document.getElementById('fieldNote').value=found.note||'';
        if(isAsset) document.getElementById('assetAnnualRate').value=found.annualRate||'';
        if(isLiab){
          document.getElementById('liabTotalDebt').value=found.totalDebt||'';
          document.getElementById('liabTotalPeriods').value=found.totalPeriods||'';
          document.getElementById('liabPaidPeriods').value=found.paidPeriods||'';
          document.getElementById('liabStartDate').value=found.startDate||'';
          document.getElementById('liabMonthlyPrincipal').value=found.monthlyPrincipal||'';
          document.getElementById('liabMonthlyInterest').value=found.monthlyInterest||'';
          document.getElementById('liabFeeRate').value=found.feeRate||'';
          document.getElementById('liabRepayDay').value=found.repayDay||'';
        }
      }
    }
  } else {
    document.getElementById('itemId').value='';
    document.getElementById('modalForm').reset();
    document.getElementById('fieldCurrency').value='CNY';
    if(isLoan) document.getElementById('loanRateType').value='year';
  }
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal(){document.getElementById('modalOverlay').classList.remove('show')}

function populateCats(cats){
  var sel=document.getElementById('fieldCategory');
  sel.innerHTML='<option value="">请选择</option>'+cats.map(function(c){return '<option value="'+c+'">'+c+'</option>'}).join('');
}

function saveItem(e){
  e.preventDefault();
  var type=document.getElementById('itemType').value;
  var id=document.getElementById('itemId').value;

  if(type==='loan'){
    var ppVal=document.getElementById('loanPaidPeriods').value;
    var item={id:id||genId(),borrower:document.getElementById('loanBorrower').value.trim(),principal:parseFloat(document.getElementById('loanPrincipal').value)||0,rate:parseFloat(document.getElementById('loanRate').value)||0,rateType:document.getElementById('loanRateType').value,startDate:document.getElementById('loanStartDate').value,repayDay:parseInt(document.getElementById('loanRepayDay').value)||0,paidPeriods:(ppVal!==''?parseInt(ppVal):null),note:document.getElementById('loanNote').value.trim()};
    if(id){var idx=data.loans.findIndex(function(l){return l.id===id});if(idx>=0)data.loans[idx]=item}else data.loans.push(item);
  } else if(type==='income'){
    var item4={id:id||genId(),category:document.getElementById('incomeCategory').value,name:document.getElementById('incomeName').value.trim(),amount:parseFloat(document.getElementById('incomeAmount').value)||0,note:document.getElementById('incomeNote').value.trim()};
    if(id){var idx4=data.incomes.findIndex(function(i){return i.id===id});if(idx4>=0)data.incomes[idx4]=item4}else data.incomes.push(item4);
  } else if(type==='liability'){
    var totalDebt=parseFloat(document.getElementById('liabTotalDebt').value)||0;
    var totalPeriods=parseInt(document.getElementById('liabTotalPeriods').value)||0;
    var paidPeriods=parseInt(document.getElementById('liabPaidPeriods').value)||0;
    var mp=parseFloat(document.getElementById('liabMonthlyPrincipal').value)||0;
    var mi=parseFloat(document.getElementById('liabMonthlyInterest').value)||0;
    if(mp===0&&totalDebt>0&&totalPeriods>0) mp=Math.round(totalDebt/totalPeriods*100)/100;
    var remaining=totalDebt>0?Math.max(0,totalDebt-mp*paidPeriods):0;
    var item2={id:id||genId(),category:document.getElementById('fieldCategory').value,name:document.getElementById('fieldName').value.trim(),amount:remaining,totalDebt:totalDebt,totalPeriods:totalPeriods,paidPeriods:paidPeriods,startDate:document.getElementById('liabStartDate').value,monthlyPrincipal:mp,monthlyInterest:mi,monthlyTotal:mp+mi,feeRate:parseFloat(document.getElementById('liabFeeRate').value)||0,repayDay:parseInt(document.getElementById('liabRepayDay').value)||0,note:document.getElementById('fieldNote').value.trim()};
    if(id){var idx2=data.liabilities.findIndex(function(l){return l.id===id});if(idx2>=0)data.liabilities[idx2]=item2}else data.liabilities.push(item2);
  } else {
    var annualRate=parseFloat(document.getElementById('assetAnnualRate').value)||0;
    var amt=parseFloat(document.getElementById('fieldAmount').value)||0;
    var item3={id:id||genId(),category:document.getElementById('fieldCategory').value,name:document.getElementById('fieldName').value.trim(),currency:document.getElementById('fieldCurrency').value,amount:amt,annualRate:annualRate,note:document.getElementById('fieldNote').value.trim()};
    if(id){var idx3=data.assets.findIndex(function(a){return a.id===id});if(idx3>=0)data.assets[idx3]=item3}else data.assets.push(item3);
  }
  saveStore();closeModal();refreshAll();
}

function deleteItem(type,id){
  if(!confirm('确定要删除吗？'))return;
  if(type==='asset')data.assets=data.assets.filter(function(a){return a.id!==id});
  else if(type==='liability')data.liabilities=data.liabilities.filter(function(l){return l.id!==id});
  else if(type==='income')data.incomes=data.incomes.filter(function(i){return i.id!==id});
  else data.loans=data.loans.filter(function(l){return l.id!==id});
  saveStore();refreshAll();
}

function refreshAll(){renderAssets();renderLiabilities();renderLoans();renderIncomes();refreshDashboard()}

function renderAssets(){
  var tb=document.getElementById('assetsTable');
  var empty=document.getElementById('assetsEmpty');
  var mcl=document.getElementById('assetsCardList');
  if(data.assets.length===0){
    tb.innerHTML='';empty.style.display='';if(mcl)mcl.innerHTML='<div class="empty"><div class="icon">📭</div>暂无资产记录</div>';
    document.getElementById('totalAssetsSum').textContent=fmtCNY(0);
    document.getElementById('totalMonthlyIncome').textContent=fmtCNY(0);
    document.getElementById('totalAnnualIncome').textContent=fmtCNY(0);
    return;
  }
  empty.style.display='none';
  var sumCNY=0,sumMonthly=0,sumAnnual=0;
  tb.innerHTML=data.assets.map(function(a){
    var cur=a.currency||'CNY';
    var curLabel=currencyLabels[cur]||cur;
    var rate=a.annualRate||0;
    var annualIncome=a.amount*rate/100;
    var monthlyIncome=annualIncome/12;
    var amtCNY=toCNY(a.amount,cur);
    var annualCNY=toCNY(annualIncome,cur);
    var monthlyCNY=toCNY(monthlyIncome,cur);
    sumCNY+=amtCNY;sumMonthly+=monthlyCNY;sumAnnual+=annualCNY;
    var cnyNote=(cur!=='CNY')?'<br><span style="font-size:11px;color:var(--text2)">≈'+fmtCNY(amtCNY)+'</span>':'';
    return '<tr><td>'+a.category+'</td><td>'+a.name+'</td><td>'+curLabel+'</td><td class="amount">'+fmt(a.amount,cur)+cnyNote+'</td><td>'+(rate?rate+'%':'-')+'</td><td class="amount" style="color:var(--success)">'+(rate?fmt(monthlyIncome,cur):'-')+'</td><td class="amount" style="color:var(--success)">'+(rate?fmt(annualIncome,cur):'-')+'</td><td>'+(a.note||'-')+'</td><td><button class="btn btn-outline btn-sm" onclick="openModal(\'asset\',\''+a.id+'\')">编辑</button> <button class="btn btn-danger btn-sm" onclick="deleteItem(\'asset\',\''+a.id+'\')">删除</button></td></tr>';
  }).join('');
  document.getElementById('totalAssetsSum').textContent=fmtCNY(sumCNY);
  document.getElementById('totalMonthlyIncome').textContent=fmtCNY(sumMonthly);
  document.getElementById('totalAnnualIncome').textContent=fmtCNY(sumAnnual);
  // Mobile cards
  if(mcl){var mc='';data.assets.forEach(function(a){var cur=a.currency||'CNY';var rate=a.annualRate||0;var amtCNY=toCNY(a.amount,cur);var mi=a.amount*rate/100/12;mc+='<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">'+a.name+'</div><div class="m-card-subtitle">'+a.category+(cur!=='CNY'?' · '+currencyLabels[cur]:'')+'</div></div><div class="m-card-amount" style="color:var(--success)">'+fmt(a.amount,cur)+'</div></div>'+(cur!=='CNY'?'<div class="m-card-row"><span>折合人民币</span><span>'+fmtCNY(amtCNY)+'</span></div>':'')+(rate?'<div class="m-card-row"><span>年化 '+rate+'%</span><span>月收益 '+fmt(mi,cur)+'</span></div>':'')+(a.note?'<div class="m-card-row"><span>备注</span><span>'+a.note+'</span></div>':'')+'<div class="m-card-actions"><button class="btn btn-outline btn-sm" onclick="openModal(\'asset\',\''+a.id+'\')">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem(\'asset\',\''+a.id+'\')">删除</button></div></div>'});mcl.innerHTML=mc}
}

function renderLiabilities(){
  var tb=document.getElementById('liabilitiesTable');
  var empty=document.getElementById('liabilitiesEmpty');
  var mcl=document.getElementById('liabilitiesCardList');
  if(data.liabilities.length===0){tb.innerHTML='';empty.style.display='';if(mcl)mcl.innerHTML='<div class="empty"><div class="icon">📭</div>暂无负债记录</div>';document.getElementById('totalRemainingDebt').textContent=fmtCNY(0);document.getElementById('totalMonthlyPayment').textContent=fmtCNY(0);return}
  empty.style.display='none';
  var sumR=0,sumM=0;
  tb.innerHTML=data.liabilities.map(function(l){
    var rem=calcRemainingDebt(l),mt=(l.monthlyPrincipal||0)+(l.monthlyInterest||0);sumR+=rem;sumM+=mt;
    return '<tr><td>'+l.category+'</td><td>'+l.name+'</td><td class="amount">'+fmtCNY(l.totalDebt||0)+'</td><td>'+(l.totalPeriods?l.totalPeriods+'期':'-')+'</td><td>'+(l.paidPeriods!=null?l.paidPeriods+'期':'-')+'</td><td class="amount" style="color:var(--danger)">'+fmtCNY(rem)+'</td><td class="amount">'+fmtCNY(l.monthlyPrincipal||0)+'</td><td class="amount">'+fmtCNY(l.monthlyInterest||0)+'</td><td>'+(l.feeRate?l.feeRate+'%':'-')+'</td><td>'+(l.repayDay?'每月'+l.repayDay+'号':'-')+'</td><td class="text-right amount">'+fmtCNY(mt)+'</td><td><button class="btn btn-outline btn-sm" onclick="openModal(\'liability\',\''+l.id+'\')">编辑</button> <button class="btn btn-danger btn-sm" onclick="deleteItem(\'liability\',\''+l.id+'\')">删除</button></td></tr>';
  }).join('');
  document.getElementById('totalRemainingDebt').textContent=fmtCNY(sumR);
  document.getElementById('totalMonthlyPayment').textContent=fmtCNY(sumM);
  if(mcl){var mc='';data.liabilities.forEach(function(l){var rem=calcRemainingDebt(l),mt=(l.monthlyPrincipal||0)+(l.monthlyInterest||0);mc+='<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">'+l.name+'</div><div class="m-card-subtitle">'+l.category+'</div></div><div class="m-card-amount" style="color:var(--danger)">'+fmtCNY(rem)+'</div></div><div class="m-card-row"><span>贷款总额</span><span>'+fmtCNY(l.totalDebt||0)+'</span></div><div class="m-card-row"><span>进度</span><span>'+(l.paidPeriods||0)+'/'+(l.totalPeriods||'-')+'期</span></div><div class="m-card-row"><span>月还款</span><span>'+fmtCNY(mt)+'</span></div>'+(l.repayDay?'<div class="m-card-row"><span>还款日</span><span>每月'+l.repayDay+'号</span></div>':'')+'<div class="m-card-actions"><button class="btn btn-outline btn-sm" onclick="openModal(\'liability\',\''+l.id+'\')">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem(\'liability\',\''+l.id+'\')">删除</button></div></div>'});mcl.innerHTML=mc}
}

function renderLoans(){
  var tb=document.getElementById('loansTable');
  var empty=document.getElementById('loansEmpty');
  var mcl=document.getElementById('loansCardList');
  if(data.loans.length===0){tb.innerHTML='';empty.style.display='';if(mcl)mcl.innerHTML='<div class="empty"><div class="icon">📭</div>暂无借出款记录</div>';document.getElementById('totalLoanPrincipal').textContent=fmtCNY(0);document.getElementById('totalLoanInterest').textContent=fmtCNY(0);document.getElementById('totalLoanAll').textContent=fmtCNY(0);return}
  empty.style.display='none';
  var tP=0,tI=0;
  tb.innerHTML=data.loans.map(function(l){
    var c=calcLoanInterest(l);tP+=l.principal;tI+=c.interest;
    var repayDayText=l.repayDay?'每月'+l.repayDay+'号':'-';
    var periodsText=c.unit==='day'?c.periods+'天':c.periods+'期';
    var manualTag=(l.paidPeriods!=null&&l.paidPeriods!=='')?'<span style="color:var(--primary);font-size:11px"> (手动)</span>':'';
    return '<tr><td>'+l.borrower+'</td><td class="amount">'+fmtCNY(l.principal)+'</td><td>'+l.rate+'%</td><td>'+(rateTypeLabels[l.rateType]||'年利率')+'</td><td>'+l.startDate+'</td><td>'+repayDayText+'</td><td>'+periodsText+manualTag+'</td><td class="text-right amount">'+fmtCNY(c.interest)+'</td><td><button class="btn btn-outline btn-sm" onclick="openModal(\'loan\',\''+l.id+'\')">编辑</button> <button class="btn btn-danger btn-sm" onclick="deleteItem(\'loan\',\''+l.id+'\')">删除</button></td></tr>';
  }).join('');
  document.getElementById('totalLoanPrincipal').textContent=fmtCNY(tP);
  document.getElementById('totalLoanInterest').textContent=fmtCNY(tI);
  document.getElementById('totalLoanAll').textContent=fmtCNY(tP+tI);
  if(mcl){var mc='';data.loans.forEach(function(l){var c=calcLoanInterest(l);var pText=c.unit==='day'?c.periods+'天':c.periods+'期';var manualTag=(l.paidPeriods!=null&&l.paidPeriods!=='')?'(手动)':'';mc+='<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">'+l.borrower+'</div><div class="m-card-subtitle">'+(rateTypeLabels[l.rateType]||'年利率')+' '+l.rate+'%</div></div><div class="m-card-amount" style="color:var(--primary)">'+fmtCNY(c.interest)+'</div></div><div class="m-card-row"><span>本金</span><span>'+fmtCNY(l.principal)+'</span></div><div class="m-card-row"><span>已收</span><span>'+pText+' '+manualTag+'</span></div>'+(l.repayDay?'<div class="m-card-row"><span>还款日</span><span>每月'+l.repayDay+'号</span></div>':'')+'<div class="m-card-row"><span>起始</span><span>'+l.startDate+'</span></div><div class="m-card-actions"><button class="btn btn-outline btn-sm" onclick="openModal(\'loan\',\''+l.id+'\')">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem(\'loan\',\''+l.id+'\')">删除</button></div></div>'});mcl.innerHTML=mc}
}

function renderIncomes(){
  var tb=document.getElementById('incomesTable');
  var empty=document.getElementById('incomesEmpty');
  var mcl=document.getElementById('incomesCardList');
  if(!data.incomes||data.incomes.length===0){
    tb.innerHTML='';empty.style.display='';if(mcl)mcl.innerHTML='<div class="empty"><div class="icon">📭</div>暂无主动收入记录</div>';
    document.getElementById('totalActiveIncome').textContent=fmtCNY(0);
    document.getElementById('totalActiveIncomeYear').textContent=fmtCNY(0);
    return;
  }
  empty.style.display='none';
  var sum=0;
  tb.innerHTML=data.incomes.map(function(i){
    sum+=i.amount;
    return '<tr><td>'+i.category+'</td><td>'+i.name+'</td><td class="text-right amount">'+fmtCNY(i.amount)+'</td><td>'+(i.note||'-')+'</td><td><button class="btn btn-outline btn-sm" onclick="openModal(\'income\',\''+i.id+'\')">编辑</button> <button class="btn btn-danger btn-sm" onclick="deleteItem(\'income\',\''+i.id+'\')">删除</button></td></tr>';
  }).join('');
  document.getElementById('totalActiveIncome').textContent=fmtCNY(sum);
  document.getElementById('totalActiveIncomeYear').textContent=fmtCNY(sum*12);
  if(mcl){var mc='';data.incomes.forEach(function(i){mc+='<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">'+i.name+'</div><div class="m-card-subtitle">'+i.category+'</div></div><div class="m-card-amount" style="color:var(--warning)">'+fmtCNY(i.amount)+'/月</div></div>'+(i.note?'<div class="m-card-row"><span>备注</span><span>'+i.note+'</span></div>':'')+'<div class="m-card-actions"><button class="btn btn-outline btn-sm" onclick="openModal(\'income\',\''+i.id+'\')">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteItem(\'income\',\''+i.id+'\')">删除</button></div></div>'});mcl.innerHTML=mc}
}

var assetChartInstance=null,liabilityChartInstance=null;
var chartColors=['#0984e3','#00b894','#fdcb6e','#e17055','#6c5ce7','#00cec9','#fab1a0','#74b9ff'];

function refreshDashboard(){
  var totalA=0;
  data.assets.forEach(function(a){totalA+=toCNY(a.amount,a.currency||'CNY')});
  var loanTotal=0;
  data.loans.forEach(function(l){var c=calcLoanInterest(l);loanTotal+=l.principal+c.interest});
  totalA+=loanTotal;
  var totalL=0;
  data.liabilities.forEach(function(l){totalL+=calcRemainingDebt(l)});
  var net=totalA-totalL;

  // 被动收入
  var passiveIncome=0;
  data.assets.forEach(function(a){
    var rate=a.annualRate||0;
    if(rate>0) passiveIncome+=toCNY(a.amount*rate/100/12,a.currency||'CNY');
  });
  data.loans.forEach(function(l){
    var c=calcLoanInterest(l);
    if(c.unit==='month'&&c.periods>0) passiveIncome+=c.interest/c.periods;
    else if(c.unit==='day'&&c.periods>0) passiveIncome+=c.interest/c.periods*30;
  });
  // 主动收入
  var activeIncome=0;
  if(data.incomes) data.incomes.forEach(function(i){activeIncome+=i.amount});
  var totalIncome=passiveIncome+activeIncome;
  // 月支出
  var monthlyExpense=0;
  data.liabilities.forEach(function(l){monthlyExpense+=(l.monthlyPrincipal||0)+(l.monthlyInterest||0)});
  var cashFlow=totalIncome-monthlyExpense;

  document.getElementById('totalAssets').textContent=fmtCNY(totalA);
  document.getElementById('totalLiabilities').textContent=fmtCNY(totalL);
  var nwEl=document.getElementById('netWorth');
  nwEl.textContent=fmtCNY(net);
  nwEl.className='card-value '+(net>=0?'positive':'negative');
  var cfEl=document.getElementById('monthlyCashFlow');
  cfEl.textContent=fmtCNY(cashFlow);
  cfEl.className='card-value '+(cashFlow>=0?'positive':'negative');
  document.getElementById('cashFlowDetail').innerHTML='被动 '+fmtCNY(passiveIncome)+' + 主动 '+fmtCNY(activeIncome)+' - 支出 '+fmtCNY(monthlyExpense);

  var rows='';
  data.assets.forEach(function(a){
    var cur=a.currency||'CNY';var amtCNY=toCNY(a.amount,cur);var displayAmt=fmt(a.amount,cur);
    if(cur!=='CNY') displayAmt+=' <span style="color:var(--text2);font-size:12px">≈'+fmtCNY(amtCNY)+'</span>';
    rows+='<tr><td><span class="tag tag-asset">资产</span></td><td>'+a.category+'</td><td>'+a.name+'</td><td class="text-right amount">'+displayAmt+'</td></tr>';
  });
  data.loans.forEach(function(l){var c=calcLoanInterest(l);rows+='<tr><td><span class="tag tag-asset">资产</span></td><td>借出款</td><td>'+l.borrower+' (本息)</td><td class="text-right amount">'+fmtCNY(l.principal+c.interest)+'</td></tr>'});
  data.liabilities.forEach(function(l){rows+='<tr><td><span class="tag tag-liability">负债</span></td><td>'+l.category+'</td><td>'+l.name+' (剩余)</td><td class="text-right amount">'+fmtCNY(calcRemainingDebt(l))+'</td></tr>'});
  if(data.incomes) data.incomes.forEach(function(i){rows+='<tr><td><span class="tag tag-income">主动收入</span></td><td>'+i.category+'</td><td>'+i.name+'</td><td class="text-right amount">'+fmtCNY(i.amount)+'/月</td></tr>'});
  document.getElementById('summaryTable').innerHTML=rows||'<tr><td colspan="4" style="text-align:center;color:var(--text2);padding:30px">暂无数据</td></tr>';

  var assetGroups={};
  data.assets.forEach(function(a){var cny=toCNY(a.amount,a.currency||'CNY');assetGroups[a.category]=(assetGroups[a.category]||0)+cny});
  if(loanTotal>0)assetGroups['借出款(本息)']=loanTotal;
  var aL=Object.keys(assetGroups),aV=aL.map(function(k){return assetGroups[k]});
  if(assetChartInstance)assetChartInstance.destroy();
  var ctx1=document.getElementById('assetChart').getContext('2d');
  assetChartInstance=aL.length>0?new Chart(ctx1,{type:'doughnut',data:{labels:aL,datasets:[{data:aV,backgroundColor:chartColors.slice(0,aL.length),borderWidth:0}]},options:{responsive:true,plugins:{legend:{position:'bottom',labels:{color:getComputedStyle(document.body).getPropertyValue('--text2').trim(),padding:12,font:{size:12}}}}}}):new Chart(ctx1,{type:'doughnut',data:{labels:['暂无数据'],datasets:[{data:[1],backgroundColor:['#dfe6e9'],borderWidth:0}]},options:{responsive:true,plugins:{legend:{display:false}}}});

  var liabGroups={};
  data.liabilities.forEach(function(l){liabGroups[l.category]=(liabGroups[l.category]||0)+calcRemainingDebt(l)});
  var lL=Object.keys(liabGroups),lV=lL.map(function(k){return liabGroups[k]});
  if(liabilityChartInstance)liabilityChartInstance.destroy();
  var ctx2=document.getElementById('liabilityChart').getContext('2d');
  liabilityChartInstance=lL.length>0?new Chart(ctx2,{type:'doughnut',data:{labels:lL,datasets:[{data:lV,backgroundColor:chartColors.slice(0,lL.length),borderWidth:0}]},options:{responsive:true,plugins:{legend:{position:'bottom',labels:{color:getComputedStyle(document.body).getPropertyValue('--text2').trim(),padding:12,font:{size:12}}}}}}):new Chart(ctx2,{type:'doughnut',data:{labels:['暂无数据'],datasets:[{data:[1],backgroundColor:['#dfe6e9'],borderWidth:0}]},options:{responsive:true,plugins:{legend:{display:false}}}});
}

function exportData(){var b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download='balance_sheet_'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(u)}

function importData(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){try{var imp=JSON.parse(ev.target.result);data=Object.assign({},defaultData,imp);if(!data.incomes)data.incomes=[];saveStore();refreshAll();alert('数据导入成功！')}catch(err){alert('导入失败：文件格式不正确')}};r.readAsText(f);e.target.value=''}

function clearAllData(){if(!confirm('确定要清空所有数据吗？此操作不可恢复！'))return;data=Object.assign({},defaultData,{theme:data.theme});saveStore();refreshAll();alert('所有数据已清空')}

refreshAll();
fetchExchangeRates();
