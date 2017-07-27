
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


// If we want to call an external script ie for audio notifications:
childproc = require('child_process');



// OK: define order expiration:  expires after extm seconds. 
placeorderENTRYEXIT = function(somepair, qty, price, priceIsExact, justValidate){
	if (qty<0) {var side='sell'} else {var side='buy'};
	// calc expiry time: extm ~ 1/4 of total barsize, but  restricted 15sec < extm < 5min
	//var extm= Math.ceil( (barsize*60)/4 );
	//extm = Math.min( Math.max(extm, 15), 5*60 );
	var extm = 55;  //60 seconds
	if (!priceIsExact) price = price*(1+Math.sign(qty)*0.0035);
	if (justValidate==undefined) justValidate=''; else justValidate=true;
	kraken.api('AddOrder', 
			{ 
			"pair": somepair, 
			"type": side, 
			"ordertype": 'limit',   
			"price": price, 
			// price*(1-Math.sign(qty)*0.50), //UNFILLABLE price for testing. dont expect a fill
			//"price2": 0, 					
			"volume": Math.abs(qty) , 					
			"leverage": tradeleverage ,	
			'validate': justValidate,   // true: do NOT submit order, only validate , false: submit order
			"oflags": "fciq",	//prefer fee in quote currency	
			"expiretm" : '+' + extm // order expires +xx seconds from now.
			}, 
			function(error, data) {
				if(error) {
					console.log(JSON.stringify( error ));
					console.log(JSON.stringify( data ));
				} else { 
					console.log(data.result.descr);
					console.log(data.result.txid); 
					if (data.result.txid==undefined) return 0; //order was a 'validation' order
					if (data.result.txid==null) return 0; // order was likely not accepted, but cannot be sure ????
					// Write to a 'globalOpenOrderIDs' array
					globalOpenOrderIDs.push( data.result.txid[0] );
					console.log('globalOpenOrderIDs==> ' + JSON.stringify(globalOpenOrderIDs) );
					console.log('globalOpenOrderIDs count ' + globalOpenOrderIDs.length);
				}
			}
	);	
	console.log('Placed LIMIT order '+side+' '+Math.abs(qty)+' '+somepair+'@'+price);
}


// OK: define order expiration:  never expires 
//~ placeorderQUICKEXIT = function(rootpairname, qty){
	//~ if (qty<0) {var side='sell'} else {var side='buy'};
	//~ kraken.api('AddOrder', 
			//~ { 
			//~ "pair": rootpairname, 
			//~ "type": side, 
			//~ "ordertype": 'market', 
			//~ //"price": price, 
			//~ //"price2": 0, 					
			//~ "volume": Math.abs(qty) , 	// using '0' can work when leverage is >1					
			//~ "leverage": tradeleverage ,		
			//~ //'validate':true,   // true: do NOT submit order, only validate 	
			//~ "oflags": "fcib",	//prefer fee in base currency					
			//~ "expiretm" : 0  // order never expires											
			//~ }, 
			//~ function(error, data) {
				//~ if(error) {
					//~ console.log(error);
					//~ if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "WARNING. Could not place exit order." ');};
					//~ //causes duplication when error.code='ESOCKETTIMEDOUT'// setTimeout(function(){ placeorderEXIT(rootpairname, qty); },5*1000);
				//~ } else { 
					//~ console.log(data.result.descr);
					//~ console.log(data.result.txid);
				//~ }
			//~ }
	//~ );		
//~ }





///////////////////////////////////////////////////////////////////////////
// //////////////////////////  Three assets - streaming OB - onOBdata() event
///////////////////////////////////////////////////////////////////////////

//var R = require("r-script");
//var RresultObj = null;
var fU=require('./finUtils');
var arr=require('./arr-stat');

// Helper function to pick best possible long/short trade from the orderbook,
// given quantity, side and a maximum price tolerance. If the orderbook allows
// us to buy/sell 'qty' units at an average price that does not deviate more 
// than 'tol' from the midpoint, then the function returns a limitPrice>0.
// otherwise it returns 0.
//   	qty : +/- units (base currency, i.e. ETH for ETHUSD)  -0.25 ETH = sell 0.25 ETH
//   	tol : 0.0017 (diflog)
//   	lmt_increment : 0.00001 (quote currency i.e. USD for ETHUSD)
//   	orderbook for this assett, with .asks, .bids

getBestPriceFor = function(qty, tol, lmt_increment, myob) {
	var setLimitPrice = 0; // 0 FALSE, >0  TRUE
	// Some info
	console.log("orderbook.asks:=  "+JSON.stringify( myob.asks ));	
	console.log("orderbook.bids:=  "+JSON.stringify( myob.bids ));		
	if (myob!=undefined) {  //Do we have the orderbook? 
		if (myob.asks.length>0 && myob.bids.length>0) {
			var tmpSpread = Number(myob.asks[0][0])-Number(myob.bids[0][0]);
			console.log('Spread: ' +  tmpSpread );
			var tmpMid = Number(myob.bids[0][0]) + 0.5*tmpSpread;
			console.log('Midpoint: ' +  tmpMid );
			// Pick best possible entry price for desired qty
			var side = Math.sign(qty);
			if (side==0) {return 0;};
			qty = Math.abs(qty); //remove sign
			var cumvol = 0;
			var avgprice = 0;
			var takePriceAsk = 0;
			if (side>0) {
				var myob_BidsOrAsks = myob.asks;
			} else if (side<0) {
				var myob_BidsOrAsks = myob.bids;
			}		
			for(ii=0; ii<myob_BidsOrAsks.length; ii++){
				var thisprice = Number(myob_BidsOrAsks[ii][0]);
				var thisvol = Number(myob_BidsOrAsks[ii][1]);	
				if (cumvol+thisvol >= qty) {  
					avgprice = (avgprice*cumvol + thisprice*(qty-cumvol))/(qty);
					cumvol = qty;	
					takePriceAsk = thisprice;	// Note that avgprice <= takePriceAsk !!
					break;
				} else {
					avgprice = (avgprice*cumvol + thisprice*thisvol)/(cumvol+thisvol);
					cumvol = cumvol+thisvol;
				}
			}
			console.log('avgprice: ' +  avgprice );
			if ( side*(Math.log(avgprice)-Math.log(tmpMid)) <= Math.log(1+tol)) setLimitPrice = takePriceAsk+side*lmt_increment;
		}
	}	
	console.log('setLimitPrice ' + setLimitPrice);
	return setLimitPrice;
};


getTradeQuantities = function(prices_mid, tradeqtyMAX, pairinfo, directions) {
	var quantities = [];	
	quantities[0] =  directions[0]*tradeqtyMAX['ETH']; //ETH quantity
	quantities[1] =  directions[1]*tradeqtyMAX['ETH']; //ETH quantity
	quantities[2] =  directions[2]*tradeqtyMAX['ETH']*prices_mid[0]; //BTC quantity
	// check if any tradeqtyMAX will be exceeded.
	//for buying a pair, we need the  quote currency(right), for selling need base currency(left)
	//0
	if (quantities[0]>0)  { 
		ok0 = ((quantities[0])*prices_mid[0]  <= tradeqtyMAX[ pairinfo[pairnames[0]].quote ]); 
	} else {
		ok0 = ( ((-1.0)*quantities[0])  <= tradeqtyMAX[ pairinfo[pairnames[0]].base ]); 
	}
	//1
	if (quantities[1]>0)  { 
		ok1 = ((quantities[1])*prices_mid[1]  <= tradeqtyMAX[ pairinfo[pairnames[1]].quote ]); 
	} else {
		ok1 = ( ((-1.0)*quantities[1])  <= tradeqtyMAX[ pairinfo[pairnames[1]].base ]); 
	}	
	//2
	if (quantities[2]>0)  { 
		ok2 = ((quantities[2])*prices_mid[2]  <= tradeqtyMAX[ pairinfo[pairnames[2]].quote ]); 
	} else {
		ok2 = ( ((-1.0)*quantities[2])  <= tradeqtyMAX[ pairinfo[pairnames[2]].base ]); 
	}		
	if (!ok0) console.log('tradeqtyMAX '+tradeqtyMAX[pairinfo[pairnames[0]].quote]+' exceed for ' + pairinfo[pairnames[0]].quote );
	if (!ok1) console.log('tradeqtyMAX '+tradeqtyMAX[pairinfo[pairnames[1]].quote]+' exceed for ' + pairinfo[pairnames[1]].quote );
	if (!ok2) console.log('tradeqtyMAX '+tradeqtyMAX[pairinfo[pairnames[2]].quote]+' exceed for ' + pairinfo[pairnames[2]].quote );
	if (!(ok0 && ok1 && ok2)) quantities = []; 
	
	return quantities;
};




//////////////////////////////////////////////////////////////////////////////
// Event function - onBar is called when ALL streams have committed a new bar.
//////////////////////////////////////////////////////////////////////////////
var glob = {}; //WARNING: stores global trade information.
var glob_prev = {};
glob.status = 'WAITFORENTRYSIGNAL';


onOBdata = function() {
	var nownow = Math.floor(Date.now()/1000);
	console.log('--------------------------------------------------');	
	console.log('onOBdata() called at:' + nownow );
	//console.log(JSON.stringify( globalOB ));
	// Why are the asks for XETHXXBT empty??? : "XETHXXBT":{"asks":[],"bids":[["0.139500","2.916 ....	
	
	if  ( globalOB[pairnames[0]].asks.length==0 || globalOB[pairnames[0]].bids.length==0 ) return 0;
	if  ( globalOB[pairnames[1]].asks.length==0 || globalOB[pairnames[1]].bids.length==0 ) return 0;
	if  ( globalOB[pairnames[2]].asks.length==0 || globalOB[pairnames[2]].bids.length==0 ) return 0;	
	console.log('All OBs are OK');
	// bid/ask midpoint for all three pairs
	var prices_mid = pairnames.map( function(pair){
		 var aa = globalOB[pair].asks[0][0];
		 var bb = globalOB[pair].bids[0][0];		 
		 var spread = (Number(aa)-Number(bb));
		 var mid = Number(bb)+spread/2.0;
		 return mid;
	});
	console.log('prices_mid  ' + JSON.stringify( prices_mid ));
	// Define the spread, get current positions and their avg. prices, if any.
	//var price_spread = Math.log(prices_mid['XETHZUSD']) - (Math.log(prices_mid['XETHXXBT']) + Math.log(prices_mid['XXBTZUSD']));
	var price_spread = Math.log(prices_mid[1])            - (Math.log(prices_mid[0])          + Math.log(prices_mid[2]));
	var thresh = 0.0016; //0.00439 //0.005;
	console.log('price_spread: ' + price_spread);	
	var cur_qty = pairnames.map( function(z){ return getPosQty(globalPositions, z); });
	var cur_avp = pairnames.map( function(z){ return getPosPrice(globalPositions, z); });
	var cur_havepos = arr.sum( cur_qty.map(Math.abs) );
	
	//  If spread > thresh, sell it, if spread < -thresh, buy it.
	if (cur_havepos==0 && glob.status == 'WAITFORENTRYSIGNAL') { // Check if entry
		
		//if (price_spread > thresh) { // potential for SELLING the spread, check OB prices
		if (Math.abs(price_spread) > thresh) { // potential for SELLING or BUYING the spread, check OB prices		
			var tradedirection = -1.0*Math.sign(price_spread);
			var directions = [];
			if (tradedirection<0) directions = directionsSellSpread; else directions = directionsBuySpread;
			var quantities = getTradeQuantities(prices_mid, tradeqtyMAX, pairinfo, directions);
			if (quantities.length==0) return 0;
			var bestOBentryPrices = pairnames.map(function(el,ii,array){
				return getBestPriceFor( quantities[ii] , 0.0017, minIncrementQuote[el], globalOB[el]);
			});
			if ( (bestOBentryPrices[0]*bestOBentryPrices[1]*bestOBentryPrices[2])!=0 ) { //Can get good entry for all three pairs.
				// set trade info
				glob.spreadEntryAt = price_spread;
				glob.tradeDirection = tradedirection; 
				glob.pricesEntryAt = bestOBentryPrices;
				glob.qtyEntryAt = quantities; // signed quantities!!!
				glob.timeEntryAt = nownow;
				// place entry orders ...
				pairnames.map( function(el,ii,array){
					if (ii==0) setTimeout(function(){placeorderENTRYEXIT(el, quantities[ii], bestOBentryPrices[ii], true, true);}, 1); //validate only// FOIFU mitigation
					setTimeout(function(){placeorderENTRYEXIT(el, quantities[ii], bestOBentryPrices[ii], true);},(ii+1)*1300); //need 1sec delay between orders
					// DEBUG HACK //if (ii==1 || ii==2) setTimeout(function(){placeorderENTRYEXIT(el, quantities[ii], bestOBentryPrices[ii], true);},(ii+1)*1000);
					
				});	
				glob.status = 'WAITFORENTRY';
			} else {console.log('No entry. Cannot get desired prices for all pairs!!');}
		} 
		 		
	} else if (cur_havepos!=0) { // have positions. trade is on	or being built	
		if (glob.status == 'WAITFOREXITSIGNAL') {			
			if ( Math.sign(price_spread) != Math.sign(glob.spreadEntryAt) ) {  // spread has opposite sign, or zero, from entry
				// We have an exit signal
				//var directions = cur_qty.map(function(z) {return -1.0*Math.sign(z)});
				var quantities = cur_qty.map(function(z) {return (-1.0)*z;});
				var bestOBentryPrices = pairnames.map(function(el,ii,array){
					//return getBestPriceFor( quantities[ii] , 0.0026, 0, globalOB[el]);
					var ret = 0;
					if (quantities[ii]!=0) ret=getBestPriceFor( quantities[ii] , 0.0026, minIncrementQuote[el], globalOB[el]);
					return ret;
				});
				//if ( (bestOBentryPrices[0]*bestOBentryPrices[1]*bestOBentryPrices[2])!=0 ) { //Can get good exit for all three pairs.
					// place exit orders ...	
					var tmpcount = 0;				
					pairnames.map( function(el,ii,array){
						if (quantities[ii]!=0) {
							if (tmpcount==0) setTimeout(function(){placeorderENTRYEXIT(el, quantities[ii], prices_mid[ii], false, true);}, 1); //validate only// FOIFU mitigation
							tmpcount = tmpcount+1;
							if (bestOBentryPrices[ii] > 0) {
								setTimeout(function(){placeorderENTRYEXIT(el, quantities[ii], bestOBentryPrices[ii], true);},(ii+1)*1300); //need 1sec delay between orders
							} else {
								setTimeout(function(){placeorderENTRYEXIT(el, quantities[ii], prices_mid[ii], false);},(ii+1)*1300); //need 1sec delay between orders
							};
						};
					});	
					glob.timeExitAt = nownow;												
					glob.status = 'WAITFOREXIT';
				//}  
			} else {  // spread has same sign as entry
				if ( Math.abs(price_spread) > thresh ) { 
					//top-up position if we have the money
					//PENDING
				}
			}
		} else if (glob.status == 'WAITFORENTRY') { // still building positions after entry signal
			var numPosNonZero = arr.sum( cur_qty.map(Math.abs).map(Math.sign) );
			if ((nownow-glob.timeEntryAt > 60) && (numPosNonZero < cur_qty.length)) { //Could not get a fill for all entry orders after 60 secs.
				// Dont try to enter any longer, just exit on next signal and hope that the positions we did
				// manage to enter will reflect the closing spread.
				glob.status = 'WAITFOREXITSIGNAL'; 
			}
		} else if (glob.status == 'WAITFOREXIT') { // still waiting for exit orders to fill ...
			//have to re-issue
			if ((nownow-glob.timeExitAt > 60)) { //Could not get a fill for all exit orders before expiry after 60 secs.
				// Wait for a new exitsignal, re-issuing orders when received.
				glob.status = 'WAITFOREXITSIGNAL'; 
			}			
		}
		
	}
	console.log('glob.status '+glob.status);
	
return 0;	
	
}



/////////////////////////////////////////////////////////////////////////////
// Event function - onTrade is called after a new trade has happened
/////////////////////////////////////////////////////////////////////////////
function onTrade(pair) { // == onPositionChanged
}


/////////////////////////////////////////////////////////////////////////////
// Event function - onPositionOpened is called after a new trade has happened
//                                   and we have opened a new position 
/////////////////////////////////////////////////////////////////////////////
function onPositionOpened(pair) {
	// Audio notification!!
	//if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "Position opened." ');}	
	console.log('Position opened '+pair);
	if (glob.status=='WAITFORENTRY') {
		var cur_qty = pairnames.map( function(z){ return getPosQty(globalPositions, z); });
		var cur_allposNonZero = ( cur_qty[0]!=0  &&  cur_qty[1]!=0 && cur_qty[2]!=0 );
		if (cur_allposNonZero) {
			// For info only,here we check the *actual* spread which we managed to get by
			// calculating it with the average prices that we got for each pair
			var cur_avp = pairnames.map( function(z){ return getPosPrice(globalPositions, z); });
			var actual_spread = Math.log(cur_avp[1])            - (Math.log(cur_avp[0])          + Math.log(cur_avp[2]));
			glob.actualSpread = actual_spread;			
			console.log('entry_spread '+glob.spreadEntryAt);
			console.log('actual_spread '+glob.actualSpread);
			//
			glob.status = 'WAITFOREXITSIGNAL';		
		}
	}
	//console.log("glob:=  "+JSON.stringify(glob));
	console.log('glob.status '+glob.status);
}


/////////////////////////////////////////////////////////////////////////////
// Event function - onPositionClosed is called after a new trade has happened
//                                   and we have closed a position 
/////////////////////////////////////////////////////////////////////////////
function onPositionClosed(pair) {
	// Audio notification!!
	//if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "Position closed." ');}	
	console.log('Position closed '+pair);
	if (glob.status=='WAITFOREXIT') {
		var cur_qty = pairnames.map( function(z){ return getPosQty(globalPositions, z); });
		var cur_havepos = arr.sum( cur_qty.map(Math.abs) );		
		if (cur_havepos==0) {
			glob = {};
			glob_prev = {};
			glob.status = 'WAITFORENTRYSIGNAL';
		}
	}
	//console.log("glob:=  "+JSON.stringify(glob));
	console.log('glob.status '+glob.status);
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




//  Orderbook streams: needs to be [branch1pairname, rootpairname, branch2pairname ]
pairnames = ['XETHXXBT', 'XETHZUSD', 'XXBTZUSD'];
rootpairname = 'XETHZUSD'; 
branch1pairname = 'XETHXXBT'; 
branch2pairname = 'XXBTZUSD'; 
directionsBuySpread = [-1,1,-1];
directionsSellSpread = [1,-1,1];
mappairname = {'XETHZUSD':'ETHUSD',  'XETHXXBT':'ETHXBT',  'XXBTZUSD':'XBTUSD'};  //first is used for order submission, second is used in globalPositions structure.
tradeqtyMAX = {};
	tradeqtyMAX.ETH = 0.100 //0.500 //maximum quantity available for trading in ETH  <--- Reference for building positions!!
	tradeqtyMAX.XBT = 0.060;  //maximum quantity available for trading in BTC
	tradeqtyMAX.USD = 240; //maximum quantity available for trading in USD
tradeleverage = 'none'; //leverage to use. must be 'none' (or integer 2,3, but not supported here. Slows down trading!!!)
pairinfo = {};
	pairinfo[rootpairname] = {};
	pairinfo[rootpairname].base = 'ETH';
	pairinfo[rootpairname].quote = 'USD';
	pairinfo[branch1pairname] = {};
	pairinfo[branch1pairname].base = 'ETH';
	pairinfo[branch1pairname].quote = 'XBT';
	pairinfo[branch2pairname] = {};
	pairinfo[branch2pairname].base = 'XBT';
	pairinfo[branch2pairname].quote = 'USD';
minIncrementQuote = {};
minIncrementQuote[rootpairname] = 0.00001; //1e-5  get from look at orderbook
minIncrementQuote[branch1pairname] = 0.000001; //1e-6  get from look at orderbook
minIncrementQuote[branch2pairname] = 0.001; //1e-3  get from look at orderbook

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
globalOpenOrderIDs = []; //Will hold the IDs of orders that we submitted, while they are not closed/expired yet.

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
						var newkeys = tmpkeys.slice(0,numorders-globalClosedOrders); //if most recent one is first in array!!  maybe not!!! check full list!!
						console.log('newkeys '+newkeys);
						//var newkeys = tmpkeys.slice(globalClosedOrders-numorders); //if most recent one is last in array??						
						var newtrades = [];
						var newcancelexpired = [];
						newkeys.forEach(function(key, index, array){ 
							if (clorders[key].status=='closed') {								
								kidx = globalOpenOrderIDs.indexOf(key);
								if (kidx>=0) { // if 'key' in globalOpenOrderIDs, we have not processed it yet.
									newtrades.push(clorders[key]); 
									globalOpenOrderIDs.splice(kidx, 1); // remove 'key' from globalOpenOrderIDs...
								} else { console.log('key ' + key + ' was not found in globalOpenOrderIDs') };
							};
							if (clorders[key].status=='canceled' || clorders[key].status=='expired' ) {
								kidx = globalOpenOrderIDs.indexOf(key);
								if (kidx>=0) { // if 'key' in globalOpenOrderIDs, we have not processed it yet.
									newcancelexpired.push(clorders[key]); 
									globalOpenOrderIDs.splice(kidx, 1); // remove 'key' from globalOpenOrderIDs...
								} else { console.log('key ' + key + ' was not found in globalOpenOrderIDs') };
							};
						});
						console.log('globalOpenOrderIDs count ' + globalOpenOrderIDs.length);
						console.log('newtrades '+JSON.stringify(newtrades));
						console.log('newcancelexpired '+JSON.stringify(newcancelexpired));
						
						// {"refid":null,"userref":null,"status":"canceled","reason":"User canceled","opentm":1489748464.5702,"closetm":1489748571.9118,"starttm":0,"expiretm":0,"descr":{"pair":"ETHEUR","type":"sell","ordertype":"limit","price":"39.85000","price2":"0","leverage":"none","order":"sell 10.00000000 ETHEUR @ limit 39.85000"},"vol":"10.00000000","vol_exec":"0.00000000","cost":"0.00000","fee":"0.00000","price":"0.00000","misc":"","oflags":"fciq"}
						globalClosedOrders = numorders;	
						if (newtrades.length > 0) {		
							console.log('Closed orders:' + newtrades.length);																
							//	Determine position changes
							newtrades.forEach(function(trade, index, array){ 
								if (globalPositions[trade.descr.pair]==undefined) globalPositions[trade.descr.pair]={"posqty":0,"avgprice":0};
								if (trade.descr.type=='sell') side=-1.0; else side=1.0;	
								var cur_posqty = getPosQty(globalPositions, trade.descr.pair); 
								if ((side==Math.sign(cur_posqty)) || cur_posqty==0) { //increasing position
									globalPositions[trade.descr.pair].avgprice = (Math.abs(cur_posqty)*avgprice + Number(trade.vol_exec)*Number(trade.price))/(Math.abs(cur_posqty) + Number(trade.vol_exec));
								} // else, reducing position. No change in price that was paid for current position
								globalPositions[trade.descr.pair].posqty = globalPositions[trade.descr.pair].posqty + side*Number(trade.vol_exec); 
								if (Math.abs(globalPositions[trade.descr.pair].posqty)< 1e-10) { // flatten it to zero
									globalPositions[trade.descr.pair].posqty = 0;
									globalPositions[trade.descr.pair].avgprice = 0;
								}
							});
							console.log('globalPositions:= '+ JSON.stringify(globalPositions) );						
						};
						if (newcancelexpired.length > 0) {
							console.log('Canceled or expired orders:' + newcancelexpired.length);
							//	Determine position changes
							newcancelexpired.forEach(function(trade, index, array){ 
							    // if vol_exec!=0 then treat like a newtrade, since it is partial.								
								if (Number(trade.vol_exec)!=0) {
									if (globalPositions[trade.descr.pair]==undefined) globalPositions[trade.descr.pair]={"posqty":0,"avgprice":0};
									if (trade.descr.type=='sell') side=-1.0; else side=1.0;	
									var cur_posqty = getPosQty(globalPositions, trade.descr.pair);
									if ((side==Math.sign(cur_posqty)) || cur_posqty==0) { //increasing position
										globalPositions[trade.descr.pair].avgprice = (Math.abs(cur_posqty)*avgprice + Number(trade.vol_exec)*Number(trade.price))/(Math.abs(cur_posqty) + Number(trade.vol_exec));
									} // else, reducing position. No change in price that was paid for current position																
									globalPositions[trade.descr.pair].posqty = globalPositions[trade.descr.pair].posqty + side*Number(trade.vol_exec); 
									if (Math.abs(globalPositions[trade.descr.pair].posqty)< 1e-10) { // flatten it to zero
										globalPositions[trade.descr.pair].posqty = 0;
										globalPositions[trade.descr.pair].avgprice = 0;
									}									
								}
							});
							console.log('globalPositions:= '+ JSON.stringify(globalPositions) );																						
						};
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
						};
						
											
					} 
				} 				
			}
		});	// kraken: ClosedOrders
},15*1000); // Requesting order data every 15 seconds. 

// clearInterval(alltradeevents); 



