
// kraken
var api_key = 'aaaaaaaaa';
var api_secret = 'bbbbbbbbbbbb';

var KrakenClient = require('kraken-api');
var kraken = new KrakenClient(api_key, api_secret);


// global variables
// ...
var enableAudio = false;

// Time offset between local and kraken server in seconds (+- 1 sec accuracy)
//~ atime = Date.now();
//~ stime = null;
//~ btime = null;
//~ expectedtime = null;
//~ offsettime = null; //result here
//~ kraken.api('Time', null, function(error, data) {
    //~ btime = Date.now();	
    //~ if(error) { console.log(error); } else {
        //~ stime = data.result['unixtime']*1000;
        //~ console.log('remote:'+stime);
        //~ //
        //~ console.log('Time request took '+ (btime-atime)/1000 + ' seconds' );
        //~ expectedtime = (atime+btime)*0.5
        //~ console.log('local:'+expectedtime);
        //~ //console.log(tt);
        //~ offsettime = (expectedtime - stime)/1000;
        //~ console.log('Difference (offset) bewteen local and remote time:' + offsettime + ' seconds');
        //~ console.log('negative difference means that we are behind.');
    //~ }
//~ });



//~ // Display balance
//~ kraken.api('Balance', null, function(error, data) {
    //~ if(error) {
        //~ console.log(error);
    //~ }
    //~ else {
        //~ console.log(data.result);
    //~ }
//~ });
//~ 
//~ // All tradable pairs
//~ glAllPairs = null;
//~ kraken.api('AssetPairs', {}, function(error, data) {
    //~ if(error) {
        //~ console.log(error);
    //~ }
    //~ else {
        //~ //console.log(data.result);
        //~ glAllPairs = data.result;
    //~ }
//~ });
//~ 
//~ 
//~ // Get Ticker Info
//~ kraken.api('Ticker', {"pair": 'XETHZEUR, XETHXXBT, XXBTZEUR'}, function(error, data) {
    //~ if(error) {
        //~ console.log(error);
    //~ }
    //~ else {
        //~ console.log(data.result);
    //~ }
//~ });


//~ // OHLC
//~ pairname = 'XETHZEUR';
//~ barsize = '1'; //minutes
//~ ohlc = null;
//~ kraken.api('OHLC', {"pair": pairname, 'interval':barsize }, function(error, data) {
    //~ if(error) {
        //~ console.log(error);
    //~ }
    //~ else {
        //~ //console.log(data.result);
        //~ ohlc = data.result;
    //~ }
//~ });
//~ ohlc[pairname]
//~ ohlc[pairname][ ohlc[pairname].length-1 ]
//~ ohlc['last']
//~ 

// If we want to call an external script ie for audio notifications:
childproc = require('child_process');



// OK: define order expiration:  expires after (barsize*60)/4 seconds. barsize is in minutes!!
placeorderENTRY = function(rootpairname, qty, price, priceIsExact){
	if (qty<0) {var side='sell'} else {var side='buy'};
	// calc expiry time: extm ~ 1/4 of total barsize, but  restricted 15sec < extm < 5min
	var extm= Math.ceil( (barsize*60)/4 );
	extm = Math.min( Math.max(extm, 15), 5*60 );
	if (!priceIsExact) price = price*(1+Math.sign(qty)*0.0025);
	kraken.api('AddOrder', 
			{ 
			"pair": rootpairname, 
			"type": side, 
			"ordertype": 'limit',   
			"price": price, 
			// price*(1-Math.sign(qty)*0.50), //UNFILLABLE price for testing. dont expect a fill
			//"price2": 0, 					
			"volume": Math.abs(qty) , 					
			"leverage": tradeleverage ,	
			//'validate':true,   // true: do NOT submit order, only validate 	
			"oflags": "fcib",	//prefer fee in base currency	
			"expiretm" : '+' + extm // order expires +xx seconds from now.
			}, 
			function(error, data) {
				if(error) {console.log(error);} else { 
					console.log(data.result.descr);
					console.log(data.result.txid);
				}
			}
	);	
}

// OK: define order expiration:  expires after (nextbar_timestamp-current_timestamp-10) seconds. barsize is in minutes!!
placeorderBRACKET = function(rootpairname, qty, price, price2){
	if (qty<0) {var side='sell'} else {var side='buy'};
	// get seconds to next full bar
	var extm = (Math.ceil(Date.now()/(barsize*60*1000))*barsize*60) - Math.ceil(Date.now()/1000);
	// get seconds to trade window = 6 * barsize
	//var extm = (Math.ceil(Date.now()/(barsize*60*1000))*barsize*60) + (5*barsize*60) - Math.ceil(Date.now()/1000);
	if (extm<=5) {return 0;}; // if less than 5 sec to next full bar, then don't place this bracket order.
	kraken.api('AddOrder', 
			{ 
			"pair": rootpairname, 
			"type": side, 
			"ordertype": "stop-loss-profit-limit", //'stop-loss-profit', 
			"price": price, //stop-loss
			"price2": price2, 	//profit
			"volume": Math.abs(qty) ,  // using '0' can work when leverage is >1				
			"leverage": tradeleverage ,		
			//'validate':true,   // true: do NOT submit order, only validate 
			"oflags": "fcib",	//prefer fee in base currency									
			"expiretm" : '+' + extm // order expires +xx seconds from now.						
			}, 
			function(error, data) {
				if(error) {
					console.log(error);
					if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "WARNING. Could not place bracket order." ');};
					//causes duplication when error.code='ESOCKETTIMEDOUT'// setTimeout(function(){ placeorderBRACKET(rootpairname, qty, price, price2); },5*1000);
				} else { 
					console.log(data.result.descr);
					console.log(data.result.txid);
				}
			}
	);		
}

// OK: define order expiration:  never expires 
placeorderEXIT = function(rootpairname, qty){
	if (qty<0) {var side='sell'} else {var side='buy'};
	kraken.api('AddOrder', 
			{ 
			"pair": rootpairname, 
			"type": side, 
			"ordertype": 'market', 
			//"price": price, 
			//"price2": 0, 					
			"volume": Math.abs(qty) , 	// using '0' can work when leverage is >1					
			"leverage": tradeleverage ,		
			//'validate':true,   // true: do NOT submit order, only validate 	
			"oflags": "fcib",	//prefer fee in base currency					
			"expiretm" : 0  // order never expires											
			}, 
			function(error, data) {
				if(error) {
					console.log(error);
					if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "WARNING. Could not place exit order." ');};
					//causes duplication when error.code='ESOCKETTIMEDOUT'// setTimeout(function(){ placeorderEXIT(rootpairname, qty); },5*1000);
				} else { 
					console.log(data.result.descr);
					console.log(data.result.txid);
				}
			}
	);		
}





///////////////////////////////////////////////////////////////////////////
// //////////////////////////  Three assets - streaming bars - onBar() event
///////////////////////////////////////////////////////////////////////////

//var R = require("r-script");
//var RresultObj = null;
var fU=require('./finUtils');
var arr=require('./arr-stat');

//////////////////////////////////////////////////////////////////////////////
// Event function - onBar is called when ALL streams have committed a new bar.
//////////////////////////////////////////////////////////////////////////////
var glob = {}; //WARNING: stores global trade information.
var glob_prev = {};
glob.status = 'WAITFORSIGNAL';


onOBdata = function() {
	console.log('--------------------------------------------------');	
	console.log('onOBdata() called at:' + Math.floor(Date.now()/1000) );
	console.log(JSON.stringify( globalOB ));
	// Why are the asks for XETHXXBT empty??? : "XETHXXBT":{"asks":[],"bids":[["0.139500","2.916 ....	
	
	if  ( globalOB["XETHXXBT"].asks.length==0 ) return 0;
	// bid/ask midpoint for all three pairs
	var prices_mid = pairnames.map( function(pair){
		 var aa = globalOB[pair].asks[0][0];
		 var bb = globalOB[pair].bids[0][0];		 
		 var spread = (Number(aa)-Number(bb));
		 var mid = spread/2.0;
		 return mid;
	});
	//  If spread > 0.5%, open position
	var p_spread = Math.log(prices_mid['XETHZUSD']) - (Math.log(prices_mid['XETHXXBT']) + Math.log(prices_mid['XXBTZUSD']));
	console.log('pairspread: ' + p_spread);
	
	var cur_qty = pairnames.map( function(z){ return getPosQty(globalPositions, z); });
	var cur_avp = pairnames.map( function(z){ return getPosPrice(globalPositions, z); });
	var cur_havepos = arr.sum( cur_qty.map(Math.abs) );
	// Check if we have to place orders
	if (cur_havepos==0 && glob.status == 'WAITFORSIGNAL') { // Check if entry
		if (Math.abs(p_spread) > 0.005) { // potential entry situation, check OB prices
			bestOBentryPrices = [] //PENDING... ;
			if ( goodEntryPossible(bestOBentryPrices) ) {
				// place entry orders
				//PENDING....
				glob.status = 'WAITFORENTRY';
			}
		}
	} else if (cur_havepos!=0 && glob.status == 'WAITFOREXIT') { // check if exit
		//PENDING...
		// spread has opposite sign from entry
		//		bestOBentryPrices = [] //PENDING... ;
		// 		goodEntryPossible(bestOBentryPrices)
	}
	
	
return 0;	

	console.log(pairnames[0] + ' ==>' + ohlc[0][pairnames[0]][ ohlc[0][pairnames[0]].length-1 ]  );
	console.log(pairnames[1] + ' ==>' + ohlc[1][pairnames[1]][ ohlc[1][pairnames[1]].length-1 ]  );
	console.log(pairnames[2] + ' ==>' + ohlc[2][pairnames[2]][ ohlc[2][pairnames[2]].length-1 ]  );	
	// ['XETHXXBT', 'XETHZUSD', 'XXBTZUSD'];
	// XETHXXBT ==>
	// XETHZUSD ==>1490458080,open,high,low,close,0.000000,0.00000000,0
	// XXBTZUSD ==>
	//console.log( '????? ~ ????? * ????' );
	//var pctarb = Math.log( ohlc[0][pairnames[0]][ ohlc[0][pairnames[0]].length-1 ][4] ) - 
	//		Math.log( ohlc[1][pairnames[1]][ ohlc[1][pairnames[1]].length-1 ][4] * ohlc[2][pairnames[2]][ ohlc[2][pairnames[2]].length-1 ][4] );
	//console.log(pctarb + '%');
	//console.log('===================================================');
	console.log('Requested ' + numlookbackbars + ' bars. Got this many bars:');
	console.log(pairnames[0] + ' ==>' + ohlc[0][pairnames[0]].length  );
	console.log(pairnames[1] + ' ==>' + ohlc[1][pairnames[1]].length  );
	console.log(pairnames[2] + ' ==>' + ohlc[2][pairnames[2]].length  );	
	console.log('--------------------------------------------------');		
	
	Op_price0 = ohlc[0][pairnames[0]][ ohlc[0][pairnames[0]].length-1 ][1];
	Op_price1 = ohlc[1][pairnames[1]][ ohlc[1][pairnames[1]].length-1 ][1];
	Op_price2 = ohlc[2][pairnames[2]][ ohlc[2][pairnames[2]].length-1 ][1];
	
	console.log('Op_price0 ' + Op_price0);
	console.log('Op_price1 ' + Op_price1);
	console.log('Op_price2 ' + Op_price2);
	
	// Remove last uncommitted/incomplete bar !!
	// Use only the tails since arrays can have different lengths!
	// PENDING ....	
	
	// Reshape to separate: times,O,H,L,C,Vol,VWAP,Count
	ohlc0 = fU.reshapeOHLC( ohlc[0][pairnames[0]].slice(-50) );  //only the last 50 bars. See WARNING below.
	ohlc1 = fU.reshapeOHLC( ohlc[1][pairnames[1]].slice(-50) );
	ohlc2 = fU.reshapeOHLC( ohlc[2][pairnames[2]].slice(-50) );

// Verification: compare with content of 'verif.txt'
console.log('pair0 last time+Op+Vo '+ohlc0.time.slice(-1)[0] + ' '+ ohlc0.Op.slice(-1)[0] + ' '+ ohlc0.Vo.slice(-1)[0]);
console.log('pair1 last time+Op+Vo '+ohlc1.time.slice(-1)[0] + ' '+ ohlc1.Op.slice(-1)[0] + ' '+ ohlc1.Vo.slice(-1)[0]);
console.log('pair2 last time+Op+Vo '+ohlc2.time.slice(-1)[0] + ' '+ ohlc2.Op.slice(-1)[0] + ' '+ ohlc2.Vo.slice(-1)[0]);
//tmpprice = Number(Op_price1);
//tmpstdev = arr.standardDeviation( ohlc1.Op.slice(-20).map(Number) );	// ensure that ohlc1.Op is an array of Numbers!!!!!	
//console.log('StDev[20] in %: ' + 100*tmpstdev/tmpprice);
tmpSD = arr.standardDeviation( ohlc1.Op.slice(-20).map(Number).map(Math.log).map(function(v,ii,arr){ if(ii==0) return NaN; else return v-arr[ii-1]; }).slice(-19) );
console.log('tmpSD ' + tmpSD);

	// Orderbook - Best possible entry price
	var myob = globalOB[rootpairname];
	var taketopAsk = 0; // 0 FALSE, >0  TRUE
	//if (myob!=undefined) { //Do we have the orderbook? 
	if (myob!=undefined && (Math.floor(Date.now()/1000) - globalOB_ts) < 30) {  //Do we have the orderbook? Is it younger than 30sec?
		// Some info
		console.log("orderbook.asks:=  "+JSON.stringify( myob.asks ));	
		console.log("orderbook.bids:=  "+JSON.stringify( myob.bids ));	
		var tmpSpread = Number(myob.asks[0][0])-Number(myob.bids[0][0]);
		console.log('Spread: ' +  tmpSpread );
		// Pick best entry price		
		var cumvol = 0;
		var avgprice = 0;
		var takePriceAsk = 0;
		for(ii=0; ii<myob.asks.length; ii++){
			var thisprice = Number(myob.asks[ii][0]);
			var thisvol = Number(myob.asks[ii][1]);		
			if (cumvol+thisvol > tradeqty) {  
				avgprice = (avgprice*cumvol + thisprice*(tradeqty-cumvol))/(tradeqty);
				cumvol = tradeqty;	
				takePriceAsk = thisprice;	// Note that avgprice <= takePriceAsk !!
				break;
			} else {
				avgprice = (avgprice*cumvol + thisprice*thisvol)/(cumvol+thisvol);
				cumvol = cumvol+thisvol;
			}
		}
		console.log('avgprice: ' +  avgprice );
		if (Math.log(avgprice)-Math.log(Number(Op_price1)) <= Math.log(1+0.0035)) taketopAsk = takePriceAsk+0.00001;
	}	
	console.log('taketopAsk ' + taketopAsk);

	
	// Sync. Call R script to calc signals
	// !!WARNING!! .data(..)  does not work when the total no. of bars passed in all series is > 2100, but works when <1400 ???	
	RresultObj = null;
	currentSIGNAL = false;
	RresultObj = R('./playingwith-RF/krakensim-RF-A-v042-SIGNAL.R').data( ohlc0, ohlc1, ohlc2 ).callSync();
	console.log('RresultObj ');		
//RresultObj = {}; RresultObj.SIGNAL = true; RresultObj.phat = 0.7;  // FAKE signal for testing
//console.log('OVERRIDE RresultObj ');	// FAKE signal for testing
	console.log(JSON.stringify(RresultObj));
	
	// If RresultObj returns an entry signal in the form of an array, or an integer 0/-1 if calc failed
	if (Object.keys(RresultObj).length < 1) {
		console.log('R Calculations failed.'); 
		glob.target_direction = 0; // no direction		
	};	
		
	//RresultObj.SIGNAL either TRUE (>0) or FALSE (=0)	
	if (RresultObj.SIGNAL == 0) { 
		console.log('SIGNAL FALSE.'); 
		glob.target_direction = 0; // no direction
	} else {
		console.log('SIGNAL TRUE.');
		currentSIGNAL = true;
		// Audio notification!!
		if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "We have an entry signal." ');};
		//
		// Save existing trade parameters
		glob_prev.stoploss_price = glob.stoploss_price; 
		glob_prev.target_price = glob.target_price; 
		glob_prev.phat = glob.phat;
		glob_prev.last_price =  glob.last_price;
		glob_prev.target_direction = glob.target_direction;
		//
		price = Number(Op_price1);
		//stdev = arr.standardDeviation( ohlc1.Op.slice(-20).map(Number) );	// ensure that ohlc1.Op is an array of Numbers!!!!!	
		//console.log('StDev[20] in %: ' + 100*stdev/price);
		tmpStoplossPct = Math.max(0.008, 0.5*tmpSD);
		console.log('tmpStoplossPct ' + tmpStoplossPct);
		glob.last_price = price;
		glob.target_price = price * (1 + 0.018 - 0.0017);  // = trained target(%) - 1/2 * avg. spread (%)
//glob.target_price = price * (1 + 0.0035);  //	FAKE TARGET (too tight) for testing
		//glob.stoploss_price = price * (1 - 0.15); //15% off of current price 
		//glob.stoploss_price = price - Math.min(6.0*stdev, 0.15*price); // ??x stdev off of current price, max 15% 
		//glob.stoploss_price = price * (1 - 0.0225); // (0.6/(1-0.6))*mean(target = 1.5%) = 2.25%
		glob.stoploss_price = price * (1 - tmpStoplossPct); 
		glob.target_direction = 1.0; // long	
		glob.phat = Number(RresultObj.phat);

	};	
	// Create/adjust and submit orders here, depending on the signal that was returned in RresultObj
	// WARNING ... this is CASH!! there is no paper trading!!!	

	if (glob.TTLbars!=undefined) { if (glob.TTLbars>0) glob.TTLbars = glob.TTLbars-1; }; // Decrease TTL count
		
	var cur_qty = getPosQty(globalPositions, rootpairname);
	console.log('cur_qty '+cur_qty);

	//~ // Force exit if we have reached desired CUMULATIVE profitlevel. 
	//~ if (cur_qty!=0 && glob.entryAtPrice!=undefined) { 
		//~ if ( cur_qty>0 && Number(Op_price1)/glob.entryAtPrice > (1.025 + 0.01) ) {
			//~ glob.TTLbars = 0; 
			//~ console.log('CUMULATIVE profit reached. Forcing exit.');
		//~ };
	//~ };	
	
	// Take order placing decisions
	if (cur_qty==0) {
		if (currentSIGNAL && glob.target_direction != 0 && tmpSD < tr_maxSD) {
			//~ createOrder 'limit' buy/sell order for +/-qty, expires after barsize/4 seconds. //ENTRY
			var qty = glob.target_direction*tradeqty;
			if (taketopAsk>0) { 
				placeorderENTRY(rootpairname, qty, taketopAsk, true);
			} else {
				placeorderENTRY(rootpairname, qty, glob.last_price, false);
			}
			glob.status = 'WAITFORENTRY';
			glob.TTLbars = 6;
			glob.entryAtPrice = glob.last_price;
			glob.phatOnEntry = glob.phat;
			//console.log('glob.status '+glob.status);
			console.log("glob:=  "+JSON.stringify(glob));
		};		
	} else if (glob.TTLbars <= 0 || tmpSD >= tr_maxSD) {
		//~ createOrder 'market' buy/sell order for +/-qty, never expires.  //FORCE EXIT
		if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "Forcing exit." ');};
		var qty = cur_qty;
		placeorderEXIT(rootpairname, (-1)*qty);
		glob.status = 'WAITFORFORCEDEXIT';
		glob.TTLbars  = 0;
		//console.log('glob.status '+glob.status);		
		console.log("glob:=  "+JSON.stringify(glob));
	} else if (glob.TTLbars > 0) {  
		// ADJUST TARGET AND STOPLOSS, reset TTL, if target is greater AND phat is greater
		//~ if ( currentSIGNAL && (glob.target_price > glob_prev.target_price) && (glob.phat>glob.phatOnEntry) ) { //ADJUST upwards and extend duration
			//~ if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "Adjusting bracket order upwards." ');};
			//~ glob.TTLbars = 6;	
			//~ glob.phatOnEntry = glob.phat;
			//~ console.log("Adjusting bracket order upwards. Reset TTL.");		
		//~ } else 
		{ // KEEP parameters unchanged
			//restore and use existing trade parameters
			glob.stoploss_price = glob_prev.stoploss_price; 
			glob.target_price = glob_prev.target_price; 
			glob.phat = glob_prev.phat;	
			glob.last_price = glob_prev.last_price ;
			glob.target_direction = glob_prev.target_direction;			
		}
		//~ if (Number(Op_price1) > glob.entryAtPrice*1.005) { // MOVE STOP into the profit zone as soon as possible!!
			//~ glob.stoploss_price = Math.max(glob.entryAtPrice*1.005, glob.stoploss_price );
			//~ console.log('Moved stoploss to zero-loss zone. ' + glob.stoploss_price);
		//~ }
		//~ if (Exist OpenOrders) !!!!ERROR_ABORT!!!!
		//~ createOrder 'stop-loss-profit' sell/buy order for -/+qty, expires after (nextbar_timestamp-current_timestamp-5) seconds
		var qty = cur_qty;
		placeorderBRACKET(rootpairname, (-1)*qty, glob.stoploss_price, glob.target_price);		
		glob.status = 'WAITFOREXIT';
		//console.log('glob.status '+glob.status);
		console.log("glob:=  "+JSON.stringify(glob));
		
	}
	
}



/////////////////////////////////////////////////////////////////////////////
// Event function - onTrade is called after a new trade has happened
/////////////////////////////////////////////////////////////////////////////
function onTrade(pair) {}


/////////////////////////////////////////////////////////////////////////////
// Event function - onPositionOpened is called after a new trade has happened
//                                   and we have opened a new position 
/////////////////////////////////////////////////////////////////////////////
function onPositionOpened(pair) {
	// Audio notification!!
	//if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "Position opened." ');}	
	//~ if (glob.status=='WAITFORENTRY') {
		//~ //createOrder 'stop-loss-profit' sell/buy order for -/+qty, expires after (nextbar_timestamp-current_timestamp-5) seconds
		//~ var qty = getPosQty(globalPositions, rootpairname);
		//~ console.log('qty '+qty);
		//~ placeorderBRACKET(rootpairname, (-1)*qty, glob.stoploss_price, glob.target_price );
		//~ glob.status = 'WAITFOREXIT';
		//~ //console.log('glob.status '+glob.status);
		//~ console.log("glob:=  "+JSON.stringify(glob));
	//~ } else {console.log('A position was opened, but not by this strategy. Aborting to avoid confusion!!!'); process.exit();}
}


/////////////////////////////////////////////////////////////////////////////
// Event function - onPositionClosed is called after a new trade has happened
//                                   and we have closed a position 
/////////////////////////////////////////////////////////////////////////////
function onPositionClosed(pair) {
	// Audio notification!!
	//if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "Position closed." ');}	
	//~ if (glob.status=='WAITFOREXIT') {
		//~ glob = {};
		//~ glob_prev = {};
		//~ glob.status = 'WAITFORSIGNAL';
		//~ console.log("glob:=  "+JSON.stringify(glob));
	//~ } else if (glob.status=='WAITFORFORCEDEXIT') {
		//~ glob = {};
		//~ glob_prev = {};
		//~ glob.status = 'WAITFORSIGNAL';
		//~ console.log("glob:=  "+JSON.stringify(glob));
	//~ }
}






/////////////////////////////////////////////////////////////////////////////
// CORE functions that call the event functions above
/////////////////////////////////////////////////////////////////////////////

// @kraken pairs
//~ [ 'DASHEUR',
  //~ 'DASHUSD',
  //~ 'DASHXBT',
  //~ 'GNOETH',
  //~ 'GNOEUR',
  //~ 'GNOUSD',
  //~ 'GNOXBT',
  //~ 'USDTZUSD',
  //~ 'XETCXETH',
  //~ 'XETCXXBT',
  //~ 'XETCZEUR',
  //~ 'XETCZUSD',
  //~ 'XETHXXBT',
  //~ 'XETHXXBT.d',
  //~ 'XETHZCAD',
  //~ 'XETHZCAD.d',
  //~ 'XETHZEUR',
  //~ 'XETHZEUR.d',
  //~ 'XETHZGBP',
  //~ 'XETHZGBP.d',
  //~ 'XETHZJPY',
  //~ 'XETHZJPY.d',
  //~ 'XETHZUSD',
  //~ 'XETHZUSD.d',
  //~ 'XICNXETH',
  //~ 'XICNXXBT',
  //~ 'XLTCXXBT',
  //~ 'XLTCZEUR',
  //~ 'XLTCZUSD',
  //~ 'XMLNXETH',
  //~ 'XMLNXXBT',
  //~ 'XREPXETH',
  //~ 'XREPXXBT',
  //~ 'XREPZEUR',
  //~ 'XREPZUSD',
  //~ 'XXBTZCAD',
  //~ 'XXBTZCAD.d',
  //~ 'XXBTZEUR',
  //~ 'XXBTZEUR.d',
  //~ 'XXBTZGBP',
  //~ 'XXBTZGBP.d',
  //~ 'XXBTZJPY',
  //~ 'XXBTZJPY.d',
  //~ 'XXBTZUSD',
  //~ 'XXBTZUSD.d',
  //~ 'XXDGXXBT',
  //~ 'XXLMXXBT',
  //~ 'XXLMZEUR',
  //~ 'XXLMZUSD',
  //~ 'XXMRXXBT',
  //~ 'XXMRZEUR',
  //~ 'XXMRZUSD',
  //~ 'XXRPXXBT',
  //~ 'XXRPZCAD',
  //~ 'XXRPZEUR',
  //~ 'XXRPZJPY',
  //~ 'XXRPZUSD',
  //~ 'XZECXXBT',
  //~ 'XZECZEUR',
  //~ 'XZECZUSD' ]



// ETH + BTC + USD
//----------------------------------------------------------------------
// @kraken			@poloniex							column order
// XETHXXBT		== BTC_ETH   (price of ETH quoted in BTC)  #1
// XETHZUSD		== USDT_ETH  (price of ETH quoted in USD)  #2
// XXBTZUSD		== USDT_BTC  (price of BTC quoted in USD)  #3




//  Orderbook streams
pairnames = ['XETHXXBT', 'XETHZUSD', 'XXBTZUSD'];
rootpairname = 'XETHZUSD'; 
branch1pairname = 'XETHXXBT'; 
branch2pairname = 'XXBTZUSD'; 
mappairname = {'XETHZUSD':'ETHUSD',  'XETHXXBT':'ETHBTC',  'XXBTZUSD':'BTCUSD'};  //first is used for order submission, second is used in globalPositions structure.
tradeqty = 0.625; //quantity to trade = ETH
tradeleverage = 'none'; //leverage to use. must be 'none' or integer 2,3

// Initialize
globalOB = {};
globalOB_ts = {};
globalOB_ts[pairnames[0]] = 0;
globalOB_ts[pairnames[1]] = 0;
globalOB_ts[pairnames[2]] = 0;
globalOBquery = 60; // Query OBs every xx seconds
// Wait
console.log('Waiting for start of next ' + globalOBquery + ' second interval = freq at which OBs are queried');
while(Math.floor(Date.now()/1000)%(globalOBquery)!=0){};


// PENDING: this may get out of sync after a while(?). how to check that and correct it ??
//allstreams = setTimeout(function(){
//
	obstream = setInterval( function(){
		
		// Get orderbook for rootpairname
		kraken.api('Depth', {"pair": rootpairname, 'count':10 }, function(error, data) {
			if(error) {
				console.log(error);
			} else {
				var tmpOB = data.result;
				//console.log(JSON.stringify( tmpOB[rootpairname].asks ));
				//console.log(JSON.stringify( tmpOB[rootpairname].bids ));
				console.log('Orderbook updated: ' + rootpairname);
				// Shallow Object copy: 
				globalOB[rootpairname] = Object.assign({}, tmpOB[rootpairname]);
				globalOB_ts[rootpairname] = Math.floor(Date.now()/1000);
// {
// "asks":[["313.96999","1.036",1497544647],["313.97000","181.755",1497544614],["313.99880","196.750",1497544515],["314.48995","0.613",1497544648],["314.48996","1.161",1497544261],["315.84649","2.072",1497544645],["315.84659","2.385",1497544596],["315.88790","17.000",1497544561],["315.98700","0.334",1497544335],["316.07928","261.875",1497544492],["316.55400","15.787",1497544605],["316.92978","261.961",1497544645],["316.92986","15.000",1497544494],["316.92989","285.777",1497544456],["317.00000","9.076",1497543711],["317.37000","1.000",1497530658],["317.44000","22.629",1497544124],["317.73535","65.000",1497544550],["317.98700","0.333",1497544324],["318.99768","15.000",1497544647]],
// "bids":[["313.00005","1.243",1497544647],["313.00003","17.000",1497544639],["313.00000","4.011",1497544611],["312.00037","2.486",1497544647],["312.00027","1.703",1497544554],["312.00025","114.681",1497544574],["312.00023","0.015",1497544527],["312.00001","15.000",1497544637],["312.00000","11.000",1497544582],["311.04668","1.369",1497544520],["311.00013","0.984",1497544495],["311.00000","0.988",1497544567],["310.73469","1.610",1497544523],["310.42269","1.598",1497544528],["310.00001","15.907",1497544588],["310.00000","9.162",1497544609],["309.00001","6.778",1497544645],["309.00000","10.000",1497544543],["308.51588","17.026",1497544604],["308.51586","0.012",1497544374]]
// }				
				var ma = arr.max(  Object.keys(globalOB_ts).map(function(z){ return globalOB_ts[z]; }) );
				var mi = arr.min(  Object.keys(globalOB_ts).map(function(z){ return globalOB_ts[z]; }) );
				console.log(ma-mi);
				if (ma-mi <= 5 ) setTimeout(onOBdata, 1);
			}
		});		

		// Get orderbook for branch1pairname
		kraken.api('Depth', {"pair": branch1pairname, 'count':10 }, function(error, data) {
			if(error) {
				console.log(error);
			} else {
				var tmpOB = data.result;
				//console.log(JSON.stringify( tmpOB[branch1pairname].asks ));
				//console.log(JSON.stringify( tmpOB[branch1pairname].bids ));
				console.log('Orderbook updated: ' + branch1pairname);
				// Shallow Object copy: 
				globalOB[branch1pairname] = Object.assign({}, tmpOB[branch1pairname]);
				globalOB_ts[branch1pairname] = Math.floor(Date.now()/1000);
// {
// "asks":[["313.96999","1.036",1497544647],["313.97000","181.755",1497544614],["313.99880","196.750",1497544515],["314.48995","0.613",1497544648],["314.48996","1.161",1497544261],["315.84649","2.072",1497544645],["315.84659","2.385",1497544596],["315.88790","17.000",1497544561],["315.98700","0.334",1497544335],["316.07928","261.875",1497544492],["316.55400","15.787",1497544605],["316.92978","261.961",1497544645],["316.92986","15.000",1497544494],["316.92989","285.777",1497544456],["317.00000","9.076",1497543711],["317.37000","1.000",1497530658],["317.44000","22.629",1497544124],["317.73535","65.000",1497544550],["317.98700","0.333",1497544324],["318.99768","15.000",1497544647]],
// "bids":[["313.00005","1.243",1497544647],["313.00003","17.000",1497544639],["313.00000","4.011",1497544611],["312.00037","2.486",1497544647],["312.00027","1.703",1497544554],["312.00025","114.681",1497544574],["312.00023","0.015",1497544527],["312.00001","15.000",1497544637],["312.00000","11.000",1497544582],["311.04668","1.369",1497544520],["311.00013","0.984",1497544495],["311.00000","0.988",1497544567],["310.73469","1.610",1497544523],["310.42269","1.598",1497544528],["310.00001","15.907",1497544588],["310.00000","9.162",1497544609],["309.00001","6.778",1497544645],["309.00000","10.000",1497544543],["308.51588","17.026",1497544604],["308.51586","0.012",1497544374]]
// }				
				var ma = arr.max(  Object.keys(globalOB_ts).map(function(z){ return globalOB_ts[z]; }) );
				var mi = arr.min(  Object.keys(globalOB_ts).map(function(z){ return globalOB_ts[z]; }) );
				console.log(ma-mi);
				if (ma-mi <= 5 ) setTimeout(onOBdata, 1);				
			}
		});		
		
		// Get orderbook for branch2pairname
		kraken.api('Depth', {"pair": branch2pairname, 'count':10 }, function(error, data) {
			if(error) {
				console.log(error);
			} else {
				var tmpOB = data.result;
				//console.log(JSON.stringify( tmpOB[branch2pairname].asks ));
				//console.log(JSON.stringify( tmpOB[branch2pairname].bids ));
				console.log('Orderbook updated: ' + branch2pairname);
				// Shallow Object copy: 
				globalOB[branch2pairname] = Object.assign({}, tmpOB[branch2pairname]);
				globalOB_ts[branch2pairname] = Math.floor(Date.now()/1000);
// {
// "asks":[["313.96999","1.036",1497544647],["313.97000","181.755",1497544614],["313.99880","196.750",1497544515],["314.48995","0.613",1497544648],["314.48996","1.161",1497544261],["315.84649","2.072",1497544645],["315.84659","2.385",1497544596],["315.88790","17.000",1497544561],["315.98700","0.334",1497544335],["316.07928","261.875",1497544492],["316.55400","15.787",1497544605],["316.92978","261.961",1497544645],["316.92986","15.000",1497544494],["316.92989","285.777",1497544456],["317.00000","9.076",1497543711],["317.37000","1.000",1497530658],["317.44000","22.629",1497544124],["317.73535","65.000",1497544550],["317.98700","0.333",1497544324],["318.99768","15.000",1497544647]],
// "bids":[["313.00005","1.243",1497544647],["313.00003","17.000",1497544639],["313.00000","4.011",1497544611],["312.00037","2.486",1497544647],["312.00027","1.703",1497544554],["312.00025","114.681",1497544574],["312.00023","0.015",1497544527],["312.00001","15.000",1497544637],["312.00000","11.000",1497544582],["311.04668","1.369",1497544520],["311.00013","0.984",1497544495],["311.00000","0.988",1497544567],["310.73469","1.610",1497544523],["310.42269","1.598",1497544528],["310.00001","15.907",1497544588],["310.00000","9.162",1497544609],["309.00001","6.778",1497544645],["309.00000","10.000",1497544543],["308.51588","17.026",1497544604],["308.51586","0.012",1497544374]]
// }				
				var ma = arr.max(  Object.keys(globalOB_ts).map(function(z){ return globalOB_ts[z]; }) );
				var mi = arr.min(  Object.keys(globalOB_ts).map(function(z){ return globalOB_ts[z]; }) );
				console.log(ma-mi);
				if (ma-mi <= 5 ) setTimeout(onOBdata, 1);				
			}
		});		

			
				
	}, globalOBquery*1000); // Requesting OB data every xx seconds. May need to increase frequency here. pacing errors ??
		
//
//}, -offsettime*1000); //Don't need this delay. since local time is usually behind remote time.

//clearInterval(obstream); 


// Structure for recording positions, even if unlevered!!
globalPositions_pre = {};
globalPositions = {};
globalPositions[ mappairname[pairnames[0]] ] = {posqty:0,  avgprice:0};
globalPositions[ mappairname[pairnames[1]] ] = {posqty:0,  avgprice:0};
globalPositions[ mappairname[pairnames[2]] ] = {posqty:0,  avgprice:0};

getPosQty = function(positions, pairname){
	if (positions[pairname]!=undefined) return Number(positions[pairname].posqty);
	var mappedname = mappairname[pairname];  //map to designation used for position structure
	if (mappedname==undefined) return 0;
	if (positions[mappedname]==undefined) posqty=0; else posqty=Number(positions[mappedname].posqty);
	return posqty;
}

getPosPrice = function(positions, pairname){
	if (positions[pairname]!=undefined) return Number(positions[pairname].avgprice);
	var mappedname = mappairname[pairname];  //map to designation used for position structure
	if (mappedname==undefined) return NaN;
	if (positions[mappedname]==undefined) avgprice=NaN; else avgprice=Number(positions[mappedname].avgprice);
	return avgprice;
}

// NOTE: need a way to query POSITIONS!!! (through ledger??. Can only use 'OpenPositions' if we use margin!!! So use margin.)

// Define the order event functions and call the onTrade() function and if needed onPositionOpened(), 
// and onPositionClosed() 
globalClosedOrders = -1; // set to 2 for testing only.  Must be -1;
globalClosedOrdersTimeInit = Math.floor(Date.now()/1000); //Now. Only request closed orders younger than this timestamp.
alltradeevents = setInterval( function(){
	
		kraken.api('ClosedOrders', {"start":globalClosedOrdersTimeInit}, function(error, data) {
			if(error) {
				console.log(error);
			} else {
				var clorders = data.result.closed;
				var numorders = Number(data.result.count);
				console.log('Num closed orders:'+numorders); // absolute total count.
				//console.log('globalClosedOrders:'+globalClosedOrders); // absolute total count.
				//console.log(JSON.stringify(clorders)); //Object as string
				var tmpkeys = Object.keys(clorders);				
				//console.log(tmpkeys[0]); 								
				//console.log(clorders[tmpkeys[0]].descr); 
				//console.log(clorders[tmpkeys[0]].status); 
				if (globalClosedOrders < 0) { //init
					globalClosedOrders = numorders;
					console.log('ClosedOrders count Initialized');
				} else {
					if (numorders > globalClosedOrders) { //We have new closed orders == trades
						var newkeys = tmpkeys.slice(0,numorders-globalClosedOrders); //if most recent one is first in array!!
						//var newkeys = tmpkeys.slice(globalClosedOrders-numorders); //if most recent one is last in array??						
						var newtrades = [];
						var newcancelexpired = [];
						newkeys.forEach(function(key, index, array){ 
							if (clorders[key].status=='closed') newtrades.push(clorders[key]); 
							if (clorders[key].status=='canceled' || clorders[key].status=='expired' ) newcancelexpired.push(clorders[key]); 
						});
						console.log('newtrades '+JSON.stringify(newtrades));
						console.log('newcancelexpired '+JSON.stringify(newcancelexpired));
						
						// {"refid":null,"userref":null,"status":"canceled","reason":"User canceled","opentm":1489748464.5702,"closetm":1489748571.9118,"starttm":0,"expiretm":0,"descr":{"pair":"ETHEUR","type":"sell","ordertype":"limit","price":"39.85000","price2":"0","leverage":"none","order":"sell 10.00000000 ETHEUR @ limit 39.85000"},"vol":"10.00000000","vol_exec":"0.00000000","cost":"0.00000","fee":"0.00000","price":"0.00000","misc":"","oflags":"fciq"}
						globalClosedOrders = numorders;	
						if (newtrades.length > 0) {		
							console.log('Closed orders:' + newtrades.length);																
							//	Determine position changes
							newtrades.forEach(function(trade, index, array){ 
								if (globalPositions[trade.descr.pair]==undefined) globalPositions[trade.descr.pair]=0;
								if (trade.descr.type=='sell') side=-1.0; else side=1.0;	
								var cur_posqty = globalPositions[trade.descr.pair].posqty;
								if (side==Math.sign(cur_posqty)) { //increasing position
									globalPositions[trade.descr.pair].avgprice = (Math.abs(cur_posqty)*avgprice + Number(trade.vol_exec)*Number(trade.price))/(Math.abs(cur_posqty) + Number(trade.vol_exec));
								} // else, reducing position. No change in price that was paid for current position
								globalPositions[trade.descr.pair].posqty = globalPositions[trade.descr.pair].posqty + side*Number(trade.vol_exec); 
							});
							console.log('globalPositions:= '+ JSON.stringify(globalPositions) );						
						}
						if (newcancelexpired.length > 0) {
							console.log('Canceled or expired orders:' + newcancelexpired.length);
							//	Determine position changes
							newcancelexpired.forEach(function(trade, index, array){ 
							    // if vol_exec!=0 then treat like a newtrade, since it is partial.								
								if (Number(trade.vol_exec)!=0) {
									if (globalPositions[trade.descr.pair]==undefined) globalPositions[trade.descr.pair]=0;
									if (trade.descr.type=='sell') side=-1.0; else side=1.0;	
									var cur_posqty = globalPositions[trade.descr.pair].posqty;
									if (side==Math.sign(cur_posqty)) { //increasing position
										globalPositions[trade.descr.pair].avgprice = (Math.abs(cur_posqty)*avgprice + Number(trade.vol_exec)*Number(trade.price))/(Math.abs(cur_posqty) + Number(trade.vol_exec));
									} // else, reducing position. No change in price that was paid for current position																
									globalPositions[trade.descr.pair].posqty = globalPositions[trade.descr.pair].posqty + side*Number(trade.vol_exec); 
								}
							});
							console.log('globalPositions:= '+ JSON.stringify(globalPositions) );																						
						}
						if (newtrades.length > 0 || newcancelexpired.length > 0) {
							// Check if positions have changed. If so call respective user event funcs. onTrade(pair)
							// onPositionOpened(), onPositionClosed()								
							var allPairs = Object.keys(globalPositions);
							allPairs.forEach(function(pair, index, array){
									var pre_pos = getPosQty(globalPositions_pre, pair);
									var cur_pos = getPosQty(globalPositions, pair);
									if (pre_pos!=cur_pos) setTimeout(function(){ onTrade(pair) },1); // Call the user event function asynchronously!															
									//~ // check if new position added: 0 to !=0, then call onPositionOpened()
									if (pre_pos==0 && cur_pos!=0) {onPositionOpened(pair);}; //synchronous call // 
									//~ // check if position closed: !=0 to 0, then call onPositionClosed()
									if (pre_pos!=0 && cur_pos==0) {onPositionClosed(pair);}; //synchronous call											
							});								
							// Shallow Object copy: copy  globalPositions -->  globalPositions_pre
							globalPositions_pre = Object.assign({}, globalPositions);							
						}
						
											
					} 
				} 				
			}
		});	// kraken: ClosedOrders
},15*1000); // Requesting order data every 15 seconds. 

// clearInterval(alltradeevents); 



