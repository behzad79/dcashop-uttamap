/* Dcashop Uttamap checkout integration – active MapLibre map, preserves WooCommerce checkout fields. */
(function(window, document){
  'use strict';
  var config = window.dcUttamapMap || {};
  var map = null, root = null, holder = null, messageNode = null, searchResults = null;
  var selected = {lat:35.70115,lng:51.383743}, busy=false;
  var iranArea={"bounds":[[43.7,24.1],[63.7,40.2]],"mainland":[[48.56797,29.92678],[48.01457,30.45246],[48.0047,30.98514],[47.68529,30.98485],[47.8492,31.70918],[47.33466,32.46916],[46.10936,33.01729],[45.41669,33.9678],[45.64846,34.74814],[46.15179,35.09326],[46.07634,35.67738],[45.42062,35.97755],[44.77268,37.17044],[44.77267,37.17045],[44.22576,37.97158],[44.4214,38.28128],[44.10923,39.42814],[44.79399,39.713],[44.95269,39.33576],[45.45772,38.87414],[46.14362,38.7412],[46.50572,38.77061],[47.68508,39.50836],[48.0601,39.58224],[48.35553,39.28876],[48.01074,38.79401],[48.63438,38.27038],[48.88325,38.32025],[49.19961,37.58287],[50.14777,37.37457],[50.84235,36.87281],[52.26402,36.70042],[53.82579,36.96503],[53.9216,37.19892],[54.8003,37.39242],[55.51158,37.96412],[56.18037,37.93513],[56.61937,38.12139],[57.33043,38.02923],[58.43615,37.52231],[59.23476,37.41299],[60.37764,36.52738],[61.12307,36.4916],[61.21082,35.65007],[60.80319,34.4041],[60.52843,33.67645],[60.9637,33.52883],[60.53608,32.98127],[60.86365,32.18292],[60.94194,31.54807],[61.69931,31.37951],[61.78122,30.73585],[60.87425,29.82924],[61.36931,29.30328],[61.77187,28.69933],[62.72783,28.25964],[62.75543,27.37892],[63.2339,27.21705],[63.31663,26.75653],[61.87419,26.23997],[61.49736,25.07824],[59.61613,25.38016],[58.52576,25.60996],[57.39725,25.7399],[56.97077,26.96611],[56.49214,27.1433],[55.72371,26.96463],[54.71509,26.48066],[53.4931,26.81237],[52.4836,27.58085],[51.52076,27.86569],[50.85295,28.81452],[50.11501,30.14777],[49.57685,29.98572],[48.94133,30.31709],[48.56797,29.92678]],"islands":[[53.98,26.53,0.14],[55.74,26.89,0.5],[56.46,27.07,0.12],[50.33,29.26,0.15],[55.04,25.88,0.13],[55.31,26.26,0.1],[55.14,26.24,0.09],[53.28,26.81,0.2],[53.64,26.68,0.13],[54.54,25.92,0.15],[54.51,26.28,0.14]]};
  function pointSegmentDistance(x,y,ax,ay,bx,by){
    var dx=bx-ax,dy=by-ay,denom=dx*dx+dy*dy;
    var t=denom ? Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/denom)) : 0;
    return Math.hypot(x-(ax+t*dx),y-(ay+t*dy));
  }
  function insideIran(lat,lng){
    if(!Number.isFinite(lat)||!Number.isFinite(lng)){return false;}
    var bounds=iranArea.bounds || [],poly=iranArea.mainland || [];
    if(bounds.length!==2 || poly.length<3){return false;}
    if(lng<bounds[0][0]||lng>bounds[1][0]||lat<bounds[0][1]||lat>bounds[1][1]){return false;}
    var inside=false,i,j,ax,ay,bx,by;
    for(i=0,j=poly.length-1;i<poly.length;j=i++){
      ax=poly[i][0];ay=poly[i][1];bx=poly[j][0];by=poly[j][1];
      if(((ay>lat)!==(by>lat)) && lng<(bx-ax)*(lat-ay)/(by-ay)+ax){inside=!inside;}
    }
    if(inside){return true;}
    for(i=0;i<poly.length;i++){
      var a=poly[i],b=poly[(i+1)%poly.length];
      if(pointSegmentDistance(lng,lat,a[0],a[1],b[0],b[1])<=0.11){return true;}
    }
    return (iranArea.islands || []).some(function(island){
      return Math.hypot(lng-island[0],lat-island[1])<=island[2];
    });
  }
  function outsideIranMessage(){message('انتخاب موقعیت فقط در محدوده ایران امکان‌پذیر است.');}

  function q(sel){return root ? root.querySelector(sel) : null;}
  function clearMessage(){if(messageNode){messageNode.textContent='';}}
  function message(text){if(messageNode){messageNode.textContent=text||'';}}
  function sdk(){var lib=window.maplibregl;return lib && (lib.default || lib);}
  function cleanPart(v){
    return (typeof v==='string' || typeof v==='number') ? String(v).trim() : '';
  }
  function streetAddress(result){
    var c=result&&result.components&&typeof result.components==='object'?result.components:{};
    var state=cleanPart(c.province||c.state).replace(/^استان\s+/, '');
    var city=cleanPart(c.city);
    return {address:cleanPart(c.street),state:state,city:city,
      city_candidates:[city,cleanPart(c.town),cleanPart(c.village)].filter(Boolean)};
  }
  function api(action, data){
    var body=new URLSearchParams();body.set('action', 'dcashop_uttamap_api');body.set('operation', action);body.set('nonce',config.nonce||'');
    Object.keys(data||{}).forEach(function(key){body.set(key, data[key]);});
    var endpoint=action==='search'?'search':'reverse';
    var qp=new URLSearchParams(data||{});
    function serverFallback(){
      return fetch(config.ajaxUrl,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'},body:body.toString()})
        .then(function(resp){return resp.json().catch(function(){throw new Error('پاسخ سرویس نقشه دریافت نشد.');});})
        .then(function(resp){if(!resp||!resp.success){throw new Error(resp&&resp.data&&resp.data.message || 'ارتباط با سرویس نقشه برقرار نشد.');}return resp.data;});
    }
    if(config.hasSecret || !config.publicKey){return serverFallback();}
    return fetch('https://api.uttamap.ir/v1/'+endpoint+'?'+qp.toString(),{
      headers:{'X-Api-Key':config.publicKey,'Accept':'application/json'},credentials:'omit',mode:'cors'
    }).then(function(resp){
      if(!resp.ok){throw new Error('HTTP '+resp.status);}
      return resp.json();
    }).then(function(resp){
      var results=Array.isArray(resp.results)?resp.results:[];
      if(endpoint==='search')return {items:results.map(function(r){return {
        title:r.label||'', address:r.components&&r.components.city||'',
        lat:r.location&&r.location.lat,lng:r.location&&r.location.lng
      };}).filter(function(r){return Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng));})};
      if(!results.length)throw new Error('نشانی این نقطه پیدا نشد. می‌توانید آدرس را دستی وارد کنید.');
      var value=streetAddress(results[0]);
      return {address:value.address,state:value.state,city:value.city,
        city_candidates:value.city_candidates,postcode:'',
        lat:Number(data.lat),lng:Number(data.lng)};
    }).catch(function(err){
      // Do not spend a second API request on a legitimate empty result or
      // a provider response other than a browser/CORS or domain-403 failure.
      var msg=String(err&&err.message||'');
      if(err instanceof TypeError || /HTTP 403|Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)){return serverFallback();}
      throw err;
    });
  }
  function createUI(){
    if(root){return;}
    var billing=document.querySelector('form.checkout .woocommerce-billing-fields');
    if(!billing){return;}
    root=document.createElement('section');root.className='dc-uttamap-checkout'+(config.searchEnabled?' dc-uttamap-has-search':'');
    var searchUI = config.searchEnabled ? '<div class="dc-uttamap-search">'+
      '<input type="search" class="dc-uttamap-query" placeholder="جستجوی آدرس..." aria-label="جستجوی آدرس" autocomplete="off">'+
      '<button type="button" class="dc-uttamap-search-btn" aria-label="جستجو">جستجو</button></div>' : '';
    root.innerHTML='<div class="dc-uttamap-map-frame'+(config.searchEnabled?' dc-uttamap-has-search':'')+'"><div class="dc-uttamap-map-canvas"></div>'+
      '<div class="dc-uttamap-center-pin" aria-hidden="true"><svg width="29" height="40" viewBox="0 0 36 52"><path d="M18 1C8.7 1 1 8.7 1 18c0 13.5 17 32 17 32s17-18.5 17-32C35 8.7 27.3 1 18 1Z" fill="#446084" stroke="white" stroke-width="2"/><circle cx="18" cy="18" r="7" fill="white"/></svg></div>'+
      '<button type="button" class="dc-uttamap-locate" title="موقعیت من" aria-label="موقعیت من"><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg><span>موقعیت من</span></button>'+searchUI+'<div class="dc-uttamap-results" aria-live="polite" hidden></div></div>'+
      '<p class="dc-uttamap-help">نقشه را جابه‌جا کنید تا پین روی محل تحویل قرار بگیرد.</p>'+
      '<p class="dc-uttamap-message" role="status" aria-live="polite"></p>';
    billing.insertBefore(root, billing.querySelector('.dc-address-confirm')|| billing.querySelector('.dc-modal-footer') || null);
    holder=q('.dc-uttamap-map-canvas');messageNode=q('.dc-uttamap-message');searchResults=q('.dc-uttamap-results');
    if(config.searchEnabled){
      q('.dc-uttamap-search-btn').addEventListener('click',search);
      q('.dc-uttamap-query').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();search();}});
    }
    q('.dc-uttamap-locate').addEventListener('click',locate);
  }
  function initMap(){
    if(map){window.setTimeout(function(){map.resize();},90);return;}
    var lib=sdk();
    if(!lib || !lib.Map){message('نمایش نقشه موقتاً در دسترس نیست؛ می‌توانید آدرس را دستی وارد کنید.');return;}
    try {
      if(lib.getRTLTextPluginStatus && lib.getRTLTextPluginStatus()==='unavailable'){
        lib.setRTLTextPlugin('https://tiles.uttamap.ir/js/rtl-text.js',true);
      }
      map=new lib.Map({container:holder,style:'https://tiles.uttamap.ir/styles/light/style.json?key='+encodeURIComponent(config.publicKey||''),
        center:[selected.lng, selected.lat],zoom:14, minZoom:4,maxZoom:20,
        maxBounds:iranArea.bounds, renderWorldCopies:false,trackResize:true});
      map.on('moveend',function(){
        var p=map.getCenter();
        if(!insideIran(p.lat,p.lng)){
          outsideIranMessage();
          map.easeTo({center:[selected.lng,selected.lat],duration:250});
          return;
        }
        selected={lat:p.lat,lng:p.lng};
      });
      map.on('error',function(){message('نمایش نقشه با اختلال روبه‌رو شد؛ کلید عمومی یا اتصال نقشه را بررسی کنید.');});
      window.setTimeout(function(){if(map){map.resize();}},200);
    } catch(e) {map=null;message('نقشه آماده نشد؛ می‌توانید از ثبت نشانی دستی استفاده کنید.');}
  }
  function show(coordinates){
    createUI();if(!root){return;}
    clearMessage();
    // Do not retain the previous address search when a new address editor opens.
    if(config.searchEnabled && q('.dc-uttamap-query')){q('.dc-uttamap-query').value='';}
    if(searchResults){searchResults.hidden=true;searchResults.textContent='';}
    if(coordinates && /^\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*$/.test(coordinates)){
      var parts=coordinates.split(','), lat=Number(parts[0]), lng=Number(parts[1]);
      if(insideIran(lat,lng)){selected={lat:lat,lng:lng};} else {outsideIranMessage();}
    }
    initMap();
    if(map){try{map.jumpTo({center:[selected.lng,selected.lat]});map.resize();}catch(e){}}
  }
  function locate(){
    if(!navigator.geolocation){message('مرورگر اجازه دریافت موقعیت را نمی‌دهد.');return;}
    var btn=q('.dc-uttamap-locate');btn.disabled=true;
    message('در حال دریافت موقعیت…');
    navigator.geolocation.getCurrentPosition(function(position){
      btn.disabled=false;
      if(!insideIran(position.coords.latitude,position.coords.longitude)){
        outsideIranMessage();return;
      }
      clearMessage();selected={lat:position.coords.latitude,lng:position.coords.longitude};
      if(map){map.flyTo({center:[selected.lng,selected.lat],zoom:16});}
    },function(){btn.disabled=false;message('اجازه دسترسی به موقعیت داده نشد؛ روی نقشه نشانی را انتخاب کنید.');},
    {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  }
  function search(){
    if(!config.searchEnabled){message('جستجوی نشانی در تنظیمات غیرفعال است؛ نقشه را حرکت دهید.');return;}
    var query=q('.dc-uttamap-query'), term=(query.value||'').trim();
    if(term.length<3){message('حداقل سه حرف برای جستجو وارد کنید.');return;}
    if(busy){return;}
    busy=true;searchResults.hidden=true;searchResults.textContent='';message('در حال جستجو…');
    api('search',{q:term,near:selected.lat.toFixed(5)+','+selected.lng.toFixed(5)}).then(function(data){
      clearMessage();var items=data.items||[];
      if(!items.length){message('نتیجه‌ای پیدا نشد؛ نشانی دیگری وارد کنید یا نقشه را جابه‌جا کنید.');return;}
      items.forEach(function(item){
        var btn=document.createElement('button');btn.type='button';btn.className='dc-uttamap-result';
        var title=document.createElement('strong');title.textContent=item.title;
        var sub=document.createElement('small');sub.textContent=item.address;
        btn.appendChild(title);btn.appendChild(sub);
        btn.addEventListener('click',function(){
          var lat=Number(item.lat),lng=Number(item.lng);
          if(!insideIran(lat,lng)){outsideIranMessage();return;}
          selected={lat:lat,lng:lng};
          if(map){map.flyTo({center:[selected.lng,selected.lat],zoom:16});}
          searchResults.hidden=true;query.value=item.title;
        });
        searchResults.appendChild(btn);
      });searchResults.hidden=false;
    }).catch(function(e){message(e.message);}).finally(function(){busy=false;});
  }
  function resolve(){
    createUI();
    if(!map){return Promise.reject(new Error('نقشه هنوز آماده نشده است. می‌توانید آدرس را دستی وارد کنید.'));}
    var p=map.getCenter();
    if(!insideIran(p.lat,p.lng)){return Promise.reject(new Error('انتخاب موقعیت فقط در محدوده ایران امکان‌پذیر است.'));}
    return api('reverse',{lat:p.lat,lng:p.lng});
  }
  window.DCAShopUttamapMap={show:show,resolve:resolve};
})(window, document);
