
// kraken
var api_key = 'aaaaaaaaa';
var api_secret = 'bbbbbbbbbbbb';

var KrakenClient = require('kraken-api');
var kraken = new KrakenClient(api_key, api_secret);


// global variables
// ...
var enableAudio = true;

// Time offset between local and kraken server in seconds (+- 1 sec accuracy)
atime = Date.now();
stime = null;
btime = null;
expectedtime = null;
offsettime = null; //result here
kraken.api('Time', null, function(error, data) {
    btime = Date.now();	
    if(error) { console.log(error); } else {
        stime = data.result['unixtime']*1000;
        console.log('remote:'+stime);
        //
        console.log('Time request took '+ (btime-atime)/1000 + ' seconds' );
        expectedtime = (atime+btime)*0.5
        console.log('local:'+expectedtime);
        //console.log(tt);
        offsettime = (expectedtime - stime)/1000;
        console.log('Difference (offset) bewteen local and remote time:' + offsettime + ' seconds');
        console.log('negative difference means that we are behind.');
    }
});



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
placeorderENTRY = function(tradepairname, qty, price){
	if (qty<0) {var side='sell'} else {var side='buy'};
	// calc expiry time: extm ~ 1/4 of total barsize, but  restricted 15sec < extm < 5min
	var extm= Math.ceil( (barsize*60)/4 );
	extm = Math.min( Math.max(extm, 15), 5*60 );
	kraken.api('AddOrder', 
			{ 
			"pair": tradepairname, 
			"type": side, 
			"ordertype": 'limit', 
			"price": price*(1+Math.sign(qty)*0.0017), // price*(1-Math.sign(qty)*0.20), //for testing. dont expect a fill
			//"price2": 0, 					
			"volume": Math.abs(qty) , 					
			"leverage": tradeleverage ,	
			//'validate':true,   // true: do NOT submit order, only validate 			
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

// OK: define order expiration:  expires after (nextbar_timestamp-current_timestamp-5) seconds. barsize is in minutes!!
placeorderBRACKET = function(tradepairname, qty, price, price2){
	if (qty<0) {var side='sell'} else {var side='buy'};
	// get seconds to next full bar
	var extm = (Math.ceil(Date.now()/(barsize*60*1000))*barsize*60) - Math.ceil(Date.now()/1000);
	if (extm<=5) {return 0;}; // if less than 5 sec to next full bar, then don't place this bracket order.
	kraken.api('AddOrder', 
			{ 
			"pair": tradepairname, 
			"type": side, 
			"ordertype": "stop-loss-profit-limit", //'stop-loss-profit', 
			"price": price, //stop-loss
			"price2": price2, 	//profit
			"volume": Math.abs(qty) ,  // using '0' can work when leverage is >1				
			"leverage": tradeleverage ,		
			//'validate':true,   // true: do NOT submit order, only validate 						
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

// OK: define order expiration:  never expires 
placeorderEXIT = function(tradepairname, qty){
	if (qty<0) {var side='sell'} else {var side='buy'};
	kraken.api('AddOrder', 
			{ 
			"pair": tradepairname, 
			"type": side, 
			"ordertype": 'market', 
			//"price": price, 
			//"price2": 0, 					
			"volume": Math.abs(qty) , 	// using '0' can work when leverage is >1					
			"leverage": tradeleverage ,		
			//'validate':true,   // true: do NOT submit order, only validate 			
			"expiretm" : 0  // order never expires											
			}, 
			function(error, data) {
				if(error) {console.log(error);} else { 
					console.log(data.result.descr);
					console.log(data.result.txid);
				}
			}
	);		
}





///////////////////////////////////////////////////////////////////////////
// //////////////////////////  Three assets - streaming bars - onBar() event
///////////////////////////////////////////////////////////////////////////

var R = require("r-script");
var RresultObj = null;
var fU=require('./finUtils');

//////////////////////////////////////////////////////////////////////////////
// Event function - onBar is called when ALL streams have committed a new bar.
//////////////////////////////////////////////////////////////////////////////
var glob = {}; //WARNING: stores global order information.

onBar = function(ohlc, pairnames) {
	console.log('--------------------------------------------------');	
	console.log('onBar() called at:' + Date.now());
	console.log(pairnames[0] + ' ==>' + ohlc[0][pairnames[0]][ ohlc[0][pairnames[0]].length-1 ]  );
	console.log(pairnames[1] + ' ==>' + ohlc[1][pairnames[1]][ ohlc[1][pairnames[1]].length-1 ]  );
	console.log(pairnames[2] + ' ==>' + ohlc[2][pairnames[2]][ ohlc[2][pairnames[2]].length-1 ]  );	
	console.log('--------------------------------------------------');
	// ['XETHXXBT', 'XETHZUSD', 'XXBTZUSD'];
	// XETHXXBT ==>
	// XETHZUSD ==>1490458080,open,high,low,close,0.000000,0.00000000,0
	// XXBTZUSD ==>
	//console.log( '????? ~ ????? * ????' );
	//var pctarb = Math.log( ohlc[0][pairnames[0]][ ohlc[0][pairnames[0]].length-1 ][4] ) - 
	//		Math.log( ohlc[1][pairnames[1]][ ohlc[1][pairnames[1]].length-1 ][4] * ohlc[2][pairnames[2]][ ohlc[2][pairnames[2]].length-1 ][4] );
	//console.log(pctarb + '%');
	//console.log('===================================================');
	
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
	ohlc0 = fU.reshapeOHLC( ohlc[0][pairnames[0]].slice(-30) );  //only the last 30 bars. See WARNING below.
	ohlc1 = fU.reshapeOHLC( ohlc[1][pairnames[1]].slice(-30) );
	ohlc2 = fU.reshapeOHLC( ohlc[2][pairnames[2]].slice(-30) );
	// Sync. Call R script to calc signals
	// !!WARNING!! .data(..)  does not work when the total no. of bars passed in all series is > 2100, but works when <1400 ???	
	RresultObj = null;
	RresultObj = R('./playingwith-RF/krakensim-RF-A-v02-SIGNAL.R').data( ohlc0, ohlc1, ohlc2 ).callSync();
	console.log('RresultObj ');	
	console.log(JSON.stringify(RresultObj));
	// If RresultObj returns an entry signal in the form of an array, or an integer 0/-1 if calc failed
	if (Object.keys(RresultObj).length < 1) {
		console.log('R Calculations failed.'); 
		glob.target_direction = 0; // no direction, forces exit
	};	
	
	//RresultObj.SIGNAL either TRUE (>0) or FALSE (=0)	
	if (RresultObj.SIGNAL == 0) { 
		console.log('SIGNAL FALSE.'); 
		glob.target_direction = 0; // no direction, forces exit if we have position
	} else {
		console.log('SIGNAL TRUE.');
		// Audio notification!!
		if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "We have an entry signal." ');}
		//
		price = Number(Op_price1);
		glob.last_price = price;
		glob.target_price = price * (1 + 0.03 - 0.005);  // 1%
		glob.stoploss_price = price * (1 - 0.09); //9% off of current price 
		glob.target_direction = 1.0; // long		
	};
	
	// Create and submit orders here, depending on the signal that was returned in RresultObj
	// WARNING ... this is CASH!! there is no paper trading!!!	
	

console.log(JSON.stringify(glob));
//return 0; //TEST
	
	var cur_qty = getPosQty(globalOpenPositionsLEVERED, tradepairname);
	console.log('cur_qty '+cur_qty);
	if (cur_qty==0) {
		if (glob.target_direction != 0 ) {
			//~ createOrder 'limit' buy/sell order for +/-qty, expires after barsize/4 seconds. //ENTRY
			var qty = glob.target_direction*tradeqty;
			placeorderENTRY(tradepairname, qty, glob.last_price);
			glob.status = 'WAITFORENTRY';
			console.log('glob.status '+glob.status);
		};		
	} else if (Math.sign(cur_qty) != glob.target_direction) {
		//~ createOrder 'market' buy/sell order for +/-qty, never expires.  //FORCE EXIT
		var qty = cur_qty;
		placeorderEXIT(tradepairname, (-1)*qty);
		glob.status = 'WAITFORFORCEDEXIT';
		console.log('glob.status '+glob.status);
	} else if (Math.sign(cur_qty) == glob.target_direction) {  // ADJUST TARGET AND STOPLOSS
		//~ if (Exist OpenOrders) !!!!ERROR_ABORT!!!!
		//~ createOrder 'stop-loss-profit' sell/buy order for -/+qty, expires after (nextbar_timestamp-current_timestamp-5) seconds
		var qty = cur_qty;
		placeorderBRACKET(tradepairname, (-1)*qty, glob.stoploss_price, glob.target_price);		
		glob.status = 'WAITFOREXIT';
		console.log('glob.status '+glob.status);
	}
	
}



/////////////////////////////////////////////////////////////////////////////
// Event function - onTrade is called after a new trade has happened
/////////////////////////////////////////////////////////////////////////////
function onTrade(trade) {}


/////////////////////////////////////////////////////////////////////////////
// Event function - onPositionOpened is called after a new trade has happened
//                                   and we have opened a new position 
/////////////////////////////////////////////////////////////////////////////
function onPositionOpened() {
	// Audio notification!!
	if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "Position opened." ');}	
	if (glob.status=='WAITFORENTRY') {
		//createOrder 'stop-loss-profit' sell/buy order for -/+qty, expires after (nextbar_timestamp-current_timestamp-5) seconds
		var qty = getPosQty(globalOpenPositionsLEVERED, tradepairname);
		console.log('qty '+qty);
		placeorderBRACKET(tradepairname, (-1)*qty, glob.stoploss_price, glob.target_price );
		glob.status = 'WAITFOREXIT';
		console.log('glob.status '+glob.status);
	} else {console.log('A position was opened, but not by this strategy. Aborting to avoid confusion!!!'); process.exit();}
}


/////////////////////////////////////////////////////////////////////////////
// Event function - onPositionClosed is called after a new trade has happened
//                                   and we have closed a position 
/////////////////////////////////////////////////////////////////////////////
function onPositionClosed() {
	// Audio notification!!
	if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "Position closed." ');}	
	if (glob.status=='WAITFOREXIT') {
		glob.status = 'WAITFORNEXTBAR';
		console.log('glob.status '+glob.status);
	} else if (glob.status=='WAITFORFORCEDEXIT') {
		//~ createOrder 'limit' buy/sell order for +/-qty, expires after barsize/4 seconds. //ENTRY
		//only in bidirectional strategy// var qty = glob.target_direction*tradeqty;
		//only in bidirectional strategy// placeorderENTRY(tradepairname, qty, glob.last_price);
		glob.status = 'WAITFORENTRY';
		console.log('glob.status '+glob.status);
	}
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




//  OHLC price stream
//offsettime = -11.34 // Time offset between local and kraken server in seconds (+- 1 sec accuracy)
pairnames = ['XETHXXBT', 'XETHZUSD', 'XXBTZUSD'];
barsize = '15'; //minutes .. must be 15min
tradepairname = 'XETHZUSD'; //Only this pair is traded
tradeqty = 0.26; //quanity to trade = ETH
tradeleverage = 2; //leverage to use. must be>1, otherwithse OpenOrders does not work.
// Initialize
ohlc = [];
prev_ohlc = [];
prev_ts = [];
// Wait
//console.log('Waiting for start of next bar of ' + barsize + ' minutes');
//while(Math.floor(Date.now()/1000)%(barsize*60)!=0){};

console.log('Barsize is '+ barsize +' minutes');
console.log('Waiting for start of next minute');
while(Math.floor(Date.now()/1000)%(1*60)!=0){};


// PENDING: this may get out of sync after a while(?). how to check that and correct it ??
// Define the datastreams and call the onBar() event function
//allstreams = setTimeout(function(){
//
	pairsstream = setInterval( function(){

		kraken.api('OHLC', {"pair": pairnames[0], 'interval':barsize }, function(error, data) {
			if(error) {
				console.log(error);
			}
			else {
				ohlc[0] = data.result;
				var cur_bar = ohlc[0][pairnames[0]][ ohlc[0][pairnames[0]].length-1 ];   
				//console.log( 'pair0 '+cur_bar );
				var cur_ts = cur_bar[0];   
				//console.log(prev_ts[0] + '  ' + cur_ts);
				if (prev_ts[0] != cur_ts) {
					//console.log('new bar0'); // Note that last bar is incomplete by def.
					// check if other streams also have new bar timestamp, then invoke onBar() event
					if (ohlc[1]!=undefined && ohlc[2]!=undefined) {
						var cur_barX = ohlc[1][pairnames[1]][ ohlc[1][pairnames[1]].length-1 ];
						var cur_tsX = cur_barX[0];
						var cur_barY = ohlc[2][pairnames[2]][ ohlc[2][pairnames[2]].length-1 ];
						var cur_tsY = cur_barY[0];						
						//if (cur_ts == cur_tsX && cur_ts == cur_tsY) onBar(ohlc, pairnames) //make this async ?
						if (cur_ts == cur_tsX && cur_ts == cur_tsY) setTimeout(function(){onBar(ohlc, pairnames)},1);
					}
				};
				prev_ts[0] = cur_ts;
				prev_ohlc[0] = ohlc[0];			
			}
		});
		//console.log('dispatched kraken api call');		


		kraken.api('OHLC', {"pair": pairnames[1], 'interval':barsize }, function(error, data) {
			if(error) {
				console.log(error);
			}
			else {
				ohlc[1] = data.result;
				var cur_bar = ohlc[1][pairnames[1]][ ohlc[1][pairnames[1]].length-1 ];   
				//console.log( 'pair1 '+cur_bar );
				var cur_ts = cur_bar[0];   
				//console.log(prev_ts[1] + '  ' + cur_ts);
				if (prev_ts[1] != cur_ts) {
					//console.log('new bar1');  // Note that last bar is incomplete by def.
					// check if other streams also have new bar timestamp, then invoke onBar() event
					if (ohlc[0]!=undefined && ohlc[2]!=undefined) {
						var cur_barX = ohlc[0][pairnames[0]][ ohlc[0][pairnames[0]].length-1 ];
						var cur_tsX = cur_barX[0];
						var cur_barY = ohlc[2][pairnames[2]][ ohlc[2][pairnames[2]].length-1 ];
						var cur_tsY = cur_barY[0];						
						//if (cur_ts == cur_tsX && cur_ts == cur_tsY) onBar(ohlc, pairnames) //make this async ?
						if (cur_ts == cur_tsX && cur_ts == cur_tsY) setTimeout(function(){onBar(ohlc, pairnames)},1);
					}
				};
				prev_ts[1] = cur_ts;
				prev_ohlc[1] = ohlc[1];			
			}
		});
		//console.log('dispatched kraken api call');		


		kraken.api('OHLC', {"pair": pairnames[2], 'interval':barsize }, function(error, data) {
			if(error) {
				console.log(error);
			}
			else {
				ohlc[2] = data.result;
				var cur_bar = ohlc[2][pairnames[2]][ ohlc[2][pairnames[2]].length-1 ];   
				//console.log( 'pair2 '+cur_bar );
				var cur_ts = cur_bar[0];   
				//console.log(prev_ts[2] + '  ' + cur_ts);
				if (prev_ts[2] != cur_ts) {
					//console.log('new bar2');  // Note that last bar is incomplete by def.
					// check if other streams also have new bar timestamp, then invoke onBar() event
					if (ohlc[0]!=undefined && ohlc[1]!=undefined) {
						var cur_barX = ohlc[0][pairnames[0]][ ohlc[0][pairnames[0]].length-1 ];
						var cur_tsX = cur_barX[0];
						var cur_barY = ohlc[1][pairnames[1]][ ohlc[1][pairnames[1]].length-1 ];
						var cur_tsY = cur_barY[0];						
						//if (cur_ts == cur_tsX && cur_ts == cur_tsY) onBar(ohlc, pairnames) //make this async ?
						if (cur_ts == cur_tsX && cur_ts == cur_tsY) setTimeout(function(){onBar(ohlc, pairnames)},1);
					}
				};
				prev_ts[2] = cur_ts;
				prev_ohlc[2] = ohlc[2];			
			}
		});
		//console.log('dispatched kraken api call');		
				
	},60*1000); // Requesting bar data every 15 seconds. May need to increase frequency here. 5 sec gives pacing error
		
//
//}, -offsettime*1000); //Don't need this delay. since local time is usually behind remote time.

//clearInterval(pairsstream); 


// Initialize Open Orders. These orders should not be touched by the strategy!!!
// https://api.kraken.com/0/private/OpenOrders
var globalIGNOREOpenOrderIDs = null;
kraken.api('OpenOrders', {}, function(error, data) {
	if(error) { console.log(error);
	} else { 
		globalIGNOREOpenOrderIDs = Object.keys(data.result.open);
		//console.log('RESULT '+JSON.stringify(data.result.open));
	}
});
console.log('PENDING: globalIGNOREOpenOrderIDs:'+globalIGNOREOpenOrderIDs);

// Verify that there are no LEVERED open positions before starting this strategy. (safety)
globalOpenPositionsLEVERED_pre = {};
globalOpenPositionsLEVERED = {};
kraken.api('OpenPositions', {}, function(error, data) {
	if(error) { console.log(error);
	} else { 
		if (Object.keys(data.result).length > 0) {console.log('We have levered open positions!! Not allowed. Aborting'); process.exit()};
	}
});
console.log('globalOpenPositionsLEVERED:'+JSON.stringify(globalOpenPositionsLEVERED));


// Get the positions quantity (signed for long/short) for the assett 'pairname'
// from the object 'openpos' containing open positions
getPosQty = function(openpos, pairname){
	var pos = [];
	var posqty = 0;
	var side = 0;
	var tmpkeys = Object.keys(openpos);
	if (tmpkeys.length==0) return 0;
	tmpkeys.forEach(function(key, index, array){ 
		if (openpos[key].pair==pairname) { 
			if (openpos[key].type=='buy') {side=1} else {side= -1};
			pos.push(openpos[key]); 
			//posqty = side * Number(openpos[key].vol); //??
			posqty = posqty + side * Number(openpos[key].vol); //??
		}
	});	
	if (pos.length>1) {
			console.log('Found more than one open position for pair '+pairname+'. This can happen if an order is split.'); 
			console.log( JSON.stringify(openpos) )
			//process.exit();
	};
	return posqty;
}


// NOTE: need a way to query POSITIONS!!! (through ledger??. Can only use 'OpenPositions' if we use margin!!! So use margin.)

// Define the order event functions and call the onTrade() function and if needed onPositionOpened(), 
// and onPositionClosed() 
globalClosedOrders = -1; // set to 2 for testing only.  Must be -1;
alltradeevents = setInterval( function(){
	
		//~ // DEBUG
		//~ kraken.api('OpenOrders', {}, function(error, data) {
			//~ if(error) { console.log(error); } else { 
				//~ //console.log('OpenOrders: '+JSON.stringify(data.result.open));
				//~ console.log('Num open orders: '+Object.keys(data.result.open).length );
			//~ }
		//~ });	
		//~ // DEBUG
		
		kraken.api('OpenPositions', {}, function(error, data) {
			if(error) { console.log(error);
			} else { 
				globalOpenPositionsLEVERED_pre = globalOpenPositionsLEVERED;
				globalOpenPositionsLEVERED = data.result;
				var pre_pos = getPosQty(globalOpenPositionsLEVERED_pre, tradepairname);
				var cur_pos = getPosQty(globalOpenPositionsLEVERED, tradepairname);
				// check if new position added: 0 to !=0, then call onPositionOpened()
				if (pre_pos==0 && cur_pos!=0) setTimeout(function(){ onPositionOpened() },1); // Call the user event function asynchronously!					
				// check if position closed: !=0 to 0, then call onPositionClosed()
				if (pre_pos!=0 && cur_pos==0) setTimeout(function(){ onPositionClosed() },1); // Call the user event function asynchronously!
				//globalOpenPositionsLEVERED = openPositionsLEVERED;
			}
		});		

		kraken.api('ClosedOrders', {}, function(error, data) {
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
						newkeys.forEach(function(key, index, array){ 
							if (clorders[key].status=='closed') newtrades.push(clorders[key]); 
						});
						console.log('newtrades '+JSON.stringify(newtrades));
						// {"refid":null,"userref":null,"status":"canceled","reason":"User canceled","opentm":1489748464.5702,"closetm":1489748571.9118,"starttm":0,"expiretm":0,"descr":{"pair":"ETHEUR","type":"sell","ordertype":"limit","price":"39.85000","price2":"0","leverage":"none","order":"sell 10.00000000 ETHEUR @ limit 39.85000"},"vol":"10.00000000","vol_exec":"0.00000000","cost":"0.00000","fee":"0.00000","price":"0.00000","misc":"","oflags":"fciq"}
						globalClosedOrders = numorders;	
						if (newtrades.length > 0) {
							setTimeout(function(){ onTrade(newtrades) },1); // Call the user event function asynchronously!												
							// Check if positions have changed. If so call respective user event funcs.
							// onPositionOpened(), onPositionClosed()	
							//globalOpenPositionsLEVERED_pre = globalOpenPositionsLEVERED;						
							//~ kraken.api('OpenPositions', {}, function(error, data) {
								//~ if(error) { console.log(error);
								//~ } else { 
									//~ globalOpenPositionsLEVERED_pre = globalOpenPositionsLEVERED;
									//~ globalOpenPositionsLEVERED = data.result;
									//~ var pre_pos = getPosQty(globalOpenPositionsLEVERED_pre, tradepairname);
									//~ var cur_pos = getPosQty(globalOpenPositionsLEVERED, tradepairname);
									//~ // check if new position added: 0 to !=0, then call onPositionOpened()
									//~ if (pre_pos==0 && cur_pos!=0) {onPositionOpened();}; //synchronous call
									//~ // check if position closed: !=0 to 0, then call onPositionClosed()
									//~ if (pre_pos!=0 && cur_pos==0) {onPositionClosed();}; //synchronous call
									//~ //globalOpenPositionsLEVERED = openPositionsLEVERED;
								//~ }
							//~ });
							
						}					
					} 
				} 				
			}
		});	// kraken: ClosedOrders
},15*1000); // Requesting order data every 15 seconds. 

// clearInterval(alltradeevents); 



