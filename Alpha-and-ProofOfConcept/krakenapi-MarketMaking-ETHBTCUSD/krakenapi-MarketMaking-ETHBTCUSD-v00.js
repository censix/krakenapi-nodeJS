
// kraken
var api_key = 'aaaaaaaaa';
var api_secret = 'bbbbbbbbbbbb';

var KrakenClient = require('kraken-api');
var kraken = new KrakenClient(api_key, api_secret);


// global variables
// ...
var enableAudio = false;


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



// OK: 
placeorderENTRYEXIT = function(somepair, qty, price, priceIsExact, justValidate, submitCount, replacementForOrderID){
	if (qty<0) {var side='sell'} else {var side='buy'};
	// calc expiry time: extm ~ 1/4 of total barsize, but  restricted 15sec < extm < 5min
	//var extm= Math.ceil( (barsize*60)/4 );
	//extm = Math.min( Math.max(extm, 15), 5*60 );
	//var extm = 50;  //less than on first submission
	var extm = 0; // order never exipres
	//if (submitCount==undefined) extm = 55;  //first submission. 
	//if (!priceIsExact) price = price*(1+Math.sign(qty)*0.0026);
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
			"oflags": "fciq", //,	//prefer fee in quote currency	
			//"expiretm" : '+' + extm // order expires +xx seconds from now.
			"expiretm" : extm,
			"userref": globalUserref
			}, 
			function(error, data) {
				if(error) {
					console.log(JSON.stringify( error ));
					console.log(JSON.stringify( data ));
					// re-submit once
					if (submitCount==undefined) submitCount=0;
					submitCount++;
					if (submitCount<=2) setTimeout(function(){ console.log(submitCount +' Re-submitting order: '+somepair +' '+ qty +'@'+ price); placeorderENTRYEXIT(somepair, qty, price, true, undefined, submitCount, replacementForOrderID);  } ,3001); // re-submit twice				
				} else { 
					console.log(data.result.descr);
					console.log(data.result.txid); 
					if (data.result.txid==undefined) return 0; //order was a 'validation' order
					// If this is a replacement order, record that it was successfully submitted. 
					if (replacementForOrderID!=undefined) { 
						if ( globalLadderOrders[somepair].sell[replacementForOrderID] != undefined ) { globalLadderOrders[somepair].sell[replacementForOrderID]=null; }; 
						if ( globalLadderOrders[somepair].buy[replacementForOrderID] != undefined ) { globalLadderOrders[somepair].buy[replacementForOrderID]=null; }; 
						globalReplaceOrderIDs.pop(globalReplaceOrderIDs.indexOf(replacementForOrderID)); 
					};					
					// Record  Orderid (=data.result.txid[0]) on ladder with price information. Could extend this to have an Object instead of just price.	
					globalLadderOrders[somepair][side][data.result.txid[0]] = price ;	
					// Write to a 'globalOpenOrderIDs' array
					globalOpenOrderIDs.push( data.result.txid[0] );
					console.log('globalOpenOrderIDs==> ' + JSON.stringify(globalOpenOrderIDs) );
					console.log('globalOpenOrderIDs count ' + globalOpenOrderIDs.length);
				}
			}
	);	
	console.log('Placed LIMIT order '+side+' '+Math.abs(qty)+' '+somepair+'@'+price);
}


// Cancels All open orders that this strategy has placed, using Userref!!!
cancelAllUserrefOrders = function(submitCount) {
	kraken.api('CancelOrder', 
			{ 
				"txid": globalUserref //submitting a userref instead of a txid is possible according to API documentation
			}, 
			function(error, data) {
				if(error) {
					console.log(JSON.stringify( error ));
					console.log(JSON.stringify( data ));
					// re-submit once on submission error
					if (submitCount==undefined) submitCount=0;
					submitCount++;
					if (submitCount<=1) setTimeout(function(){ console.log(submitCount +' Re-submitting CancelAll');  cancelAllUserrefOrders(submitCount);  } ,1001); // re-submit only once					
				} else { 
					console.log('CancelAll canceled: '+data.result.count);
					console.log('CancelAll  pending: '+data.result.pending); 
				}
			}
	);	
}

// Cancels a single order 
cancelOrder = function(orderID, submitCount) {
	kraken.api('CancelOrder', 
			{ 
				"txid": orderID 
			}, 
			function(error, data) {
				if(error) {
					console.log(JSON.stringify( error ));
					console.log(JSON.stringify( data ));
					// re-submit once on submission error
					if (submitCount==undefined) submitCount=0;
					submitCount++;
					if (submitCount<=1) setTimeout(function(){ console.log(submitCount +' Re-submitting cancelOrder ' + orderID);  cancelOrder(orderID, submitCount);  } ,1001); // re-submit only once					
				} else { 
					console.log('CancelOrder canceled: '+data.result.count);
					console.log('CancelOrder  pending: '+data.result.pending); 
				}
			}
	);	
}


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

//~ getBestPriceFor = function(qty, tol, lmt_increment, myob) {
	//~ var setLimitPrice = 0; // 0 FALSE, >0  TRUE
	//~ // Some info
	//~ console.log("orderbook.asks:=  "+JSON.stringify( myob.asks ));	
	//~ console.log("orderbook.bids:=  "+JSON.stringify( myob.bids ));		
	//~ if (myob!=undefined) {  //Do we have the orderbook? 
		//~ if (myob.asks.length>0 && myob.bids.length>0) {
			//~ var tmpSpread = Number(myob.asks[0][0])-Number(myob.bids[0][0]);
			//~ console.log('Spread: ' +  tmpSpread );
			//~ var tmpMid = Number(myob.bids[0][0]) + 0.5*tmpSpread;
			//~ console.log('Midpoint: ' +  tmpMid );
			//~ // Pick best possible entry price for desired qty
			//~ var side = Math.sign(qty);
			//~ if (side==0) {return 0;};
			//~ qty = Math.abs(qty); //remove sign
			//~ var cumvol = 0;
			//~ var avgprice = 0;
			//~ var takePriceAsk = 0;
			//~ if (side>0) {
				//~ var myob_BidsOrAsks = myob.asks;
			//~ } else if (side<0) {
				//~ var myob_BidsOrAsks = myob.bids;
			//~ }		
			//~ for(ii=0; ii<myob_BidsOrAsks.length; ii++){
				//~ var thisprice = Number(myob_BidsOrAsks[ii][0]);
				//~ var thisvol = Number(myob_BidsOrAsks[ii][1]);	
				//~ // if thisvol is more than X times larger than qty, it is unlikely to let itself down to filling us, so ignore it.
				//~ if ((thisvol/qty)>100) {continue;}; 
				//~ if (cumvol+thisvol >= qty) {  
					//~ avgprice = (avgprice*cumvol + thisprice*(qty-cumvol))/(qty);
					//~ cumvol = qty;	
					//~ takePriceAsk = thisprice;	// Note that avgprice <= takePriceAsk !!
					//~ break;
				//~ } else {
					//~ avgprice = (avgprice*cumvol + thisprice*thisvol)/(cumvol+thisvol);
					//~ cumvol = cumvol+thisvol;
				//~ }
			//~ }
			//~ console.log('avgprice: ' +  avgprice );
			//~ if ( side*(Math.log(avgprice)-Math.log(tmpMid)) <= Math.log(1+tol)) setLimitPrice = takePriceAsk+side*lmt_increment;
		//~ }
	//~ }	
	//~ console.log('setLimitPrice ' + setLimitPrice);
	//~ return setLimitPrice;
//~ };


//~ getTradeQuantities = function(prices_mid, tradeqtyMAX, pairinfo, directions) {
	//~ var quantities = [];	
	//~ quantities[0] =  directions[0]*tradeqtyMAX['ETH']; //ETH quantity
	//~ quantities[1] =  directions[1]*tradeqtyMAX['ETH']; //ETH quantity
	//~ quantities[2] =  directions[2]*tradeqtyMAX['ETH']*prices_mid[0]; //BTC quantity
	//~ // check if any tradeqtyMAX will be exceeded.
	//~ //for buying a pair, we need the  quote currency(right), for selling need base currency(left)
	//~ //0
	//~ if (quantities[0]>0)  { 
		//~ ok0 = ((quantities[0])*prices_mid[0]  <= tradeqtyMAX[ pairinfo[pairnames[0]].quote ]); 
	//~ } else {
		//~ ok0 = ( ((-1.0)*quantities[0])  <= tradeqtyMAX[ pairinfo[pairnames[0]].base ]); 
	//~ }
	//~ //1
	//~ if (quantities[1]>0)  { 
		//~ ok1 = ((quantities[1])*prices_mid[1]  <= tradeqtyMAX[ pairinfo[pairnames[1]].quote ]); 
	//~ } else {
		//~ ok1 = ( ((-1.0)*quantities[1])  <= tradeqtyMAX[ pairinfo[pairnames[1]].base ]); 
	//~ }	
	//~ //2
	//~ if (quantities[2]>0)  { 
		//~ ok2 = ((quantities[2])*prices_mid[2]  <= tradeqtyMAX[ pairinfo[pairnames[2]].quote ]); 
	//~ } else {
		//~ ok2 = ( ((-1.0)*quantities[2])  <= tradeqtyMAX[ pairinfo[pairnames[2]].base ]); 
	//~ }		
	//~ if (!ok0) console.log('tradeqtyMAX '+tradeqtyMAX[pairinfo[pairnames[0]].quote]+' exceed for ' + pairinfo[pairnames[0]].quote );
	//~ if (!ok1) console.log('tradeqtyMAX '+tradeqtyMAX[pairinfo[pairnames[1]].quote]+' exceed for ' + pairinfo[pairnames[1]].quote );
	//~ if (!ok2) console.log('tradeqtyMAX '+tradeqtyMAX[pairinfo[pairnames[2]].quote]+' exceed for ' + pairinfo[pairnames[2]].quote );
	//~ if (!(ok0 && ok1 && ok2)) quantities = []; 
	//~ 
	//~ return quantities;
//~ };

//  B/(A*C)
spread_BdivAC = function(A,B,C) { // percentage-like spread
	var price_spread = Math.log(Number(B)) - (Math.log(Number(A)) + Math.log(Number(C)));
	return price_spread;
}


//////////////////////////////////////////////////////////////////////////////
// Event function - onBar is called when ALL streams have committed a new bar.
//////////////////////////////////////////////////////////////////////////////
var glob = {}; //WARNING: stores global trade information.
var glob_prev = {};
glob.status = 'WAITFORLADDERSETUP';  // Inital status


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
		//var price_spread_VERIF = Math.log(prices_mid[1]) - (Math.log(prices_mid[0]) + Math.log(prices_mid[2]));
		//console.log('price_spread_VERIF: ' + price_spread_VERIF);
	var price_spread = spread_BdivAC(prices_mid[0], prices_mid[1], prices_mid[2]);
	//var thresh = 0.0080; //0.001;
	console.log('price_spread: ' + price_spread);	
	var cur_qty = pairnames.map( function(z){ return getPosQty(globalPositions, z); });
	var cur_avp = pairnames.map( function(z){ return getPosPrice(globalPositions, z); });
	var cur_havepos = arr.sum( cur_qty.map(Math.abs) );
	
	// globalLadderConst.XETHXXBT = {qty:0.014  ,psteprel:0.00678 ,qcurr:'XBT' , depth:10 };
	var thispairIdx = 1;
	var tmpGLConst = globalLadderConst[pairnames[thispairIdx]];
	
	if (glob.status == 'WAITFORLADDERSETUP') { // still building up price ladders. 
		var tmpGLO = globalLadderOrders[pairnames[thispairIdx]];
		var LadderlengthSell = Object.keys(tmpGLO.sell).length;
		var LadderlengthBuy = Object.keys(tmpGLO.buy).length;
		if (LadderlengthSell == 0) {  // create sell ladder. Note that the stepsize is relative to current price and needs to be adjusted as price changes!!
			var tmpseq = Array.from(new Array(tmpGLConst.depth),(val,index)=>index+1).reverse(); // array containing 1..tmpGLConst.depth, in reverse order
			tmpseq.forEach(function(step, ii, array){
				var DEBUGoffset = 0; //(0.20*prices_mid[thispairIdx]); //0
				var theprice = prices_mid[thispairIdx] + step*(tmpGLConst.psteprel*prices_mid[thispairIdx]) + DEBUGoffset; // last term is for DEBUG only. must be 0 for live.
				var theqty = -1.0*Math.abs(tmpGLConst.qty);	  //make sure its  sell			
				// placeorderENTRYEXIT(somepair, qty, price, priceIsExact, justValidate, submitCount, replacementForOrderID)
				setTimeout(function(){placeorderENTRYEXIT(pairnames[thispairIdx], theqty, theprice, true, undefined, undefined, undefined);}, step*2000+1001);	
			});
			glob.ladderSetupStart = nownow;	
		}; 
		if (LadderlengthBuy == 0) {  // create buy ladder. Note that the stepsize is relative to current price and needs to be adjusted as price changes!!
			var tmpseq = Array.from(new Array(tmpGLConst.depth),(val,index)=>index+1).reverse(); // array containing 1..tmpGLConst.depth, in reverse order
			tmpseq.forEach(function(step, ii, array){
				var DEBUGoffset = 0; //(0.20*prices_mid[thispairIdx]); //0;
				var theprice = prices_mid[thispairIdx] - step*(tmpGLConst.psteprel*prices_mid[thispairIdx]) - DEBUGoffset; // last term is for DEBUG only. must be 0 for live.
				var theqty = Math.abs(tmpGLConst.qty);	  //make sure its  buy			
				// placeorderENTRYEXIT(somepair, qty, price, priceIsExact, justValidate, submitCount, replacementForOrderID)
				setTimeout(function(){placeorderENTRYEXIT(pairnames[thispairIdx], theqty, theprice, true, undefined, undefined, undefined);}, step*2000+1);	
			});		
			glob.ladderSetupStart = nownow;	
		}; 
		//
		if (( LadderlengthSell == tmpGLConst.depth) && ( LadderlengthBuy == tmpGLConst.depth)) { // have full ladder setup
			glob.ladderSetupEnd = nownow;	
			glob.status = 'WAITFORLADDERTRADES';
		} else if (  nownow - glob.ladderSetupStart > 2*60) { // if ladder not setup after 2min. cancel everything
			glob.status = 'WAITFORLADDERCANCEL'; // Need to change state before cancel, otherwise canceled orders will be replaced.
			cancelAllUserrefOrders();
		}
		//
		console.log(JSON.stringify(tmpGLO)); //DEBUG

	} else if (glob.status == 'WAITFORLADDERTRADES' || glob.status == 'WAITFORLADDEREXTENSION')  { // trading or extending ladders
		//WHAT TO DO ????	
		if (  nownow - glob.ladderSetupEnd > 10*60) { // cancel the ladder trading after 10 minutes
			cancelAllUserrefOrders();
			glob.status = 'WAITFORLADDERCANCEL';
		}		
	} else if (glob.status == 'WAITFORLADDERCANCEL')  { // still cancelling all price ladders
		if (globalOpenOrderIDs.length == 0) {			
			console.log('No more open orders. (Did NOT check open positions!)'); //process.exit(0);
		};
	}
	console.log('glob.status '+glob.status);
	
return 0;	
	
}



/////////////////////////////////////////////////////////////////////////////
// Event function - onTrade is called after a net position change 
/////////////////////////////////////////////////////////////////////////////
function onTrade(pair) { // == onPositionChanged
	//run through globalReplaceOrderIDs  and launch replacement orders for pair, if status permits 
	var tmpGLConst = globalLadderConst[pair];
	var sellLadder = globalLadderOrders[pair].sell;
	var buyLadder = globalLadderOrders[pair].buy;
	var removeOID = [];	
	if (glob.status == 'WAITFORLADDERTRADES' || glob.status == 'WAITFORLADDEREXTENSION') {
		globalReplaceOrderIDs.forEach(function(oid,idx,array){
			//lookup order parameters (where was it in the ladder?)
			if (sellLadder[oid]!=undefined) { //it was a sell order
				//launch new order. Whether buy or sell depends on where the actual bid/ask is ? No. Just flip side
				var theprice = sellLadder[oid];	 //ladder price of the filled sell order
				var theqty = Math.abs(tmpGLConst.qty);	  //make sure its flipped to buy
				// placeorderENTRYEXIT(somepair, qty, price, priceIsExact, justValidate, submitCount, replacementForOrderID)
				setTimeout(function(){placeorderENTRYEXIT(pair, theqty, theprice, true, undefined, undefined, oid);}, (idx+1)*1000+1);
			} else if (buyLadder[oid]!=undefined) { //it was a buy order
				//launch new order. Whether buy or sell depends on where the actual bid/ask is ? No. Just flip side
				var theprice = buyLadder[oid];  //ladder price of the filled buy order
				var theqty = -1.0*Math.abs(tmpGLConst.qty);	  //make sure its flipped to sell			
				// placeorderENTRYEXIT(somepair, qty, price, priceIsExact, justValidate, submitCount, replacementForOrderID)
				setTimeout(function(){placeorderENTRYEXIT(pair, theqty, theprice, true, undefined, undefined, oid);}, (idx+1)*1000+1);	
			} else {
				//not found. this should not happen.
				console.log(oid + ' This orderID was not found in the buy/sell ladder for pair ' + pair);	
				removeOID.push(oid);
			}
		});
		// Remove non-ladder orders
		if (removeOID.length>0)  globalReplaceOrderIDs = globalReplaceOrderIDs.filter(function(el,idx,array){if (removeOID.indexOf(el)>-1) return false; else return true;});
	} 
}


/////////////////////////////////////////////////////////////////////////////
// Event function - onPositionOpened is called after a new trade has happened
//                                   and we have opened a new position 
/////////////////////////////////////////////////////////////////////////////
function onPositionOpened(pair) {
	// Audio notification!!
	//if (enableAudio) {var tmpout = childproc.exec('spd-say -t female3 "Position opened." ');}	
	console.log('Position opened '+pair);
	//~ if (glob.status=='WAITFORENTRY') {
		//~ var cur_qty = pairnames.map( function(z){ return getPosQty(globalPositions, z); });
		//~ var cur_allposNonZero = ( cur_qty[0]!=0  &&  cur_qty[1]!=0 && cur_qty[2]!=0 );
		//~ if (cur_allposNonZero) {
			//~ // For info only,here we check the *actual* spread which we managed to get by
			//~ // calculating it with the average prices that we got for each pair
			//~ var cur_avp = pairnames.map( function(z){ return getPosPrice(globalPositions, z); });
			//~ //var actual_spread = Math.log(cur_avp[1])            - (Math.log(cur_avp[0])          + Math.log(cur_avp[2]));
			//~ var actual_spread = spread_BdivAC(cur_avp[0],cur_avp[1],cur_avp[2]);
			//~ glob.actualSpread = actual_spread;			
			//~ console.log('entry_spread      '+glob.spreadEntryAt);
			//~ console.log('achievable_spread '+glob.spreadAchievable);
			//~ console.log('actual_spread     '+glob.actualSpread);
			//~ //
			//~ glob.status = 'WAITFOREXITSIGNAL';		
		//~ }
	//~ }
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
	//~ if (glob.status=='WAITFOREXIT' || glob.status=='WAITFORQUICKEXIT' ) {
		//~ var cur_qty = pairnames.map( function(z){ return getPosQty(globalPositions, z); });
		//~ var cur_havepos = arr.sum( cur_qty.map(Math.abs) );		
		//~ if (cur_havepos==0) {
			//~ // Print some pnl info: WARNING: Only correct if we have no partial trades. So better change to cumulative sum ...
			//~ // console.log('WARNING: Not correct if we had partial trades. Use sum instead.');
			//~ //console.log( JSON.stringify(globalPNL) );  //DEBUG
			//~ Object.keys(globalPNL).forEach(function(curr) {
				//~ if ( globalPNL[curr]==undefined || globalPNL[curr].length==0) return 0;
				//~ //var tmp = globalPNL[curr].slice( -1)[0]; // most recent (last) entry
				//~ //console.log( 'PNL ' + curr + ': ' + tmp.pnl.toFixed(10) + ' fee: ' + tmp.fee.toFixed(10) + '    gross(%): ' + (tmp.pnl/tmp.refcost*100).toFixed(2) +'     net(%): ' + ((tmp.pnl-tmp.fee)/tmp.refcost*100).toFixed(2) );
				//~ var cumpnlExfee = 0; //gross
				//~ var cumpnl = 0;  //net
				//~ globalPNL[curr].forEach(function(el) {  //cumulative values. processing oldest to youngest
				//~ //globalPNL[curr].reverse().forEach(function(el) {  //cumulative values. processing youngest to oldest.
					//~ cumpnlExfee = cumpnlExfee + el.pnl;
					//~ cumpnl = cumpnl + el.pnl - el.fee;	
				//~ });
				//~ console.log( 'cumulative_PNL ' + curr + ': ' + cumpnl.toFixed(10) + ' Exfee: ' + cumpnlExfee.toFixed(10)  );
			//~ });
			//~ //
			//~ glob = {};
			//~ glob_prev = {};
			//~ glob.status = 'WAITFORENTRYSIGNAL';
		//~ }
	//~ }
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



// Userref to use to identify this strategy instance
globalUserref = 110011;
//  Orderbook streams: needs to be [branch1pairname, rootpairname, branch2pairname ]
pairnames = ['XETHXXBT', 'XETHZUSD', 'XXBTZUSD'];
rootpairname = 'XETHZUSD'; 
branch1pairname = 'XETHXXBT'; 
branch2pairname = 'XXBTZUSD'; 
directionsBuySpread = [-1,1,-1];
directionsSellSpread = [1,-1,1];
mappairname = {'XETHZUSD':'ETHUSD',  'XETHXXBT':'ETHXBT',  'XXBTZUSD':'XBTUSD'};  //first is used for order submission, second is used in globalPositions structure.
tradeqtyMAX = {};
	tradeqtyMAX.ETH = 0.500 //0.500 //maximum quantity available for trading in ETH  <--- Reference for building positions!!
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



// Structure that holds constant information on the price ladder for all pairs. Depth is for one direction, symmetrical.
// psteprel has to be greater than 2*tradefee = 2*0.0017% = 0.0034%. So we set it to double that,0.00678, so we pay 50% of the gross profit as fee.
// if we set it to 3* 0.0034% =0.0103 we pay 30% fee
globalLadderConst = {};
globalLadderConst.XETHXXBT = {qty:0.014  ,psteprel:0.0103 ,pstep:NaN  ,qcurr:'XBT' , depth:7 };  // qty ~ equivalent of 5 USD, pstep ~ 0.678% of price !! 
globalLadderConst.XETHZUSD = {qty:0.014  ,psteprel:0.0103 ,pstep:NaN  ,qcurr:'USD' , depth:7 };  // qty ~ equivalent of 5 USD,  pstep ~ 0.678% of price !! 
globalLadderConst.XXBTZUSD = {qty:0.002  ,psteprel:0.0103 ,pstep:NaN  ,qcurr:'USD' , depth:7 };  // qty ~ equivalent of 5 USD,  pstep ~ 0.678% of price !! 

globalLadderOrders = {};
globalLadderOrders.XETHXXBT = {sell:{},  buy:{}};  // sell: {key:=oid , value:=price: }
globalLadderOrders.XETHZUSD = {sell:{},  buy:{}};
globalLadderOrders.XXBTZUSD = {sell:{},  buy:{}};



// Structure for recording positions, even if unlevered!!
globalPositions_pre = {};
globalPositions = {};
globalPositions[ mappairname[pairnames[0]] ] = {posqty:0,  avgprice:0};
globalPositions[ mappairname[pairnames[1]] ] = {posqty:0,  avgprice:0};
globalPositions[ mappairname[pairnames[2]] ] = {posqty:0,  avgprice:0};
globalPositions_pre = JSON.parse(JSON.stringify(globalPositions));	//Deep copy
globalOpenOrderIDs = []; //Will hold the IDs of orders that we submitted, while they are not closed/expired yet.
globalProcessedOrderIDs = []; //Will hold the IDs that were successfully removed from globalOpenOrderIDs.
globalPNL = {};  // Will contain the pnl series, one for each quote currency used.
	globalPNL.ETH = [];
	globalPNL.XBT = []; 
	globalPNL.USD = []; 
//globalReplaceOrders = []; // Will hold the orders (object) that need to be replaced in the ladder(s)
globalReplaceOrderIDs = []; // Will hold the orderIds that need to be replaced in the ladder(s

	

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

// NOTE: need a way to query POSITIONS!!! (through ledger??. Can only use 'OpenPositions' if we use margin!!! )

// Define the order event functions and call the onTrade() function and if needed onPositionOpened(), 
// and onPositionClosed() 
globalClosedOrders = -1; // set to 2 for testing only.  Must be -1;
globalClosedOrdersTimeInit = Math.floor(Date.now()/1000); //Now. Only request closed orders younger than this timestamp.
alltradeevents = setInterval( function(){
	
		kraken.api('ClosedOrders', {"start":globalClosedOrdersTimeInit, "userref": globalUserref}, function(error, data) {
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
						// Deep Object copy: copy  globalPositions -->  globalPositions_pre
						globalPositions_pre = JSON.parse(JSON.stringify(globalPositions));
						console.log('globalPositions_pre:= '+ JSON.stringify(globalPositions_pre) );
						//						
						//var newkeys = tmpkeys.slice(0,numorders-globalClosedOrders); //if most recent one is first in array!!  maybe not!!! check full list!!
						// newkeys are those keys of 'tmpkeys' that are NOT in 'globalProcessedOrderIDs'						
						var newkeys = tmpkeys.filter(function(el){ if(globalProcessedOrderIDs.indexOf(el)<0) return true; else return false; });
						console.log('newkeys '+newkeys);						
						if (newkeys.length==0) { console.log('No new keys. Something may be wrong!!!'); return 0;};
						//var newkeys = tmpkeys.slice(globalClosedOrders-numorders); //if most recent one is last in array??						
						var newtrades = [];
						var newcancelexpired = [];
						newkeys.forEach(function(key, index, array){ 
							if (clorders[key].status=='closed') {								
								kidx = globalOpenOrderIDs.indexOf(key);
								if (kidx>=0) { // if 'key' in globalOpenOrderIDs, we have not processed it yet.
									newtrades.push(clorders[key]); 
									globalOpenOrderIDs.splice(kidx, 1); // remove 'key' from globalOpenOrderIDs...									
									if (globalReplaceOrderIDs.indexOf(key)<0) {globalReplaceOrderIDs.push(key);}; // Replacement of order from ladder needed
									globalProcessedOrderIDs.push(key); // add 'key' to 'globalProcessedOrderIDs'
								} else { 
									console.log('key ' + key + ' was not found in globalOpenOrderIDs. Processing anyway!!!');
									newtrades.push(clorders[key]); 
									if (globalReplaceOrderIDs.indexOf(key)<0) {globalReplaceOrderIDs.push(key);}; // Replacement of order from ladder needed
									globalProcessedOrderIDs.push(key); // add 'key' to 'globalProcessedOrderIDs'
								};
							};
							if (clorders[key].status=='canceled' || clorders[key].status=='expired' ) {
								kidx = globalOpenOrderIDs.indexOf(key);
								if (kidx>=0) { // if 'key' in globalOpenOrderIDs, we have not processed it yet.
									newcancelexpired.push(clorders[key]); 
									globalOpenOrderIDs.splice(kidx, 1); // remove 'key' from globalOpenOrderIDs...
									if (globalReplaceOrderIDs.indexOf(key)<0) {globalReplaceOrderIDs.push(key);}; // Replacement of order from ladder needed???
									globalProcessedOrderIDs.push(key); // add 'key' to 'globalProcessedOrderIDs'
								} else { 
									console.log('key ' + key + ' was not found in globalOpenOrderIDs. Processing anyway!!!');
									newcancelexpired.push(clorders[key]); 
									if (globalReplaceOrderIDs.indexOf(key)<0) {globalReplaceOrderIDs.push(key);}; // Replacement of order from ladder needed???
									globalProcessedOrderIDs.push(key); // add 'key' to 'globalProcessedOrderIDs'									
								};
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
									globalPositions[trade.descr.pair].avgprice = (Math.abs(cur_posqty)*globalPositions[trade.descr.pair].avgprice + Number(trade.vol_exec)*Number(trade.price))/(Math.abs(cur_posqty) + Number(trade.vol_exec));
									// recording fee
									var quotecurr =  trade.descr.pair.substr(3,3); 
									globalPNL[quotecurr].push( {refcost: 0 , //Number(trade.cost)
																pnl: 0 , 
																fee: Number(trade.fee) } );											
								} else { // else, reducing position. No change in price that was paid for current position, but pnl calculations
									// globalPNL = {ETH:[ {refcost:, pnl:, fee: } , ....  ], XBT:[], USD:[] };  where refcost:=vol_exec*avgprice
									// Assuming 'oflags' contains 'fciq': fees are expressed in quote currency
									var quotecurr =  trade.descr.pair.substr(3,3); 
									globalPNL[quotecurr].push( {refcost: Number(trade.vol_exec)*globalPositions[trade.descr.pair].avgprice , 
																pnl: side*Number(trade.vol_exec)*(globalPositions[trade.descr.pair].avgprice - Number(trade.price))  , 
																fee: Number(trade.fee) } );	
									//console.log( JSON.stringify(globalPNL[quotecurr]) );  //DEBUG
								}
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
										globalPositions[trade.descr.pair].avgprice = (Math.abs(cur_posqty)*globalPositions[trade.descr.pair].avgprice + Number(trade.vol_exec)*Number(trade.price))/(Math.abs(cur_posqty) + Number(trade.vol_exec));
										// recording fee
										var quotecurr =  trade.descr.pair.substr(3,3); 
										globalPNL[quotecurr].push( {refcost: 0 , //Number(trade.cost)
																	pnl: 0 , 
																	fee: Number(trade.fee) } );											
									} else { // else, reducing position. No change in price that was paid for current position, but pnl calculations
										// globalPNL = {ETH:[ {refcost:, pnl:, fee: } , ....  ], XBT:[], USD:[] };  where refcost:=vol_exec*avgprice
										// Assuming 'oflags' contains 'fciq': fees are expressed in quote currency
										var quotecurr =  trade.descr.pair.substr(3,3); 
										globalPNL[quotecurr].push( {refcost: Number(trade.vol_exec)*globalPositions[trade.descr.pair].avgprice , 
																	pnl: side*Number(trade.vol_exec)*(globalPositions[trade.descr.pair].avgprice - Number(trade.price))  , 
																	fee: Number(trade.fee) } );	
										//console.log( JSON.stringify(globalPNL[quotecurr]) );  //DEBUG
									}
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
							console.log('globalPositions_pre:= '+ JSON.stringify(globalPositions_pre) );									
							var allPairs = Object.keys(globalPositions);
							allPairs.forEach(function(pair, index, array){
									var pre_pos = getPosQty(globalPositions_pre, pair);
									var cur_pos = getPosQty(globalPositions, pair);
									console.log(pair + ': ' + pre_pos + '==>' + cur_pos);
									if (pre_pos!=cur_pos) {onTrade(pair)}; //setTimeout(function(){ onTrade(pair) },1); // Call the user event function asynchronously??
									//~ // check if new position added: 0 to !=0, then call onPositionOpened()
									if ((pre_pos==0) && (cur_pos!=0)) {onPositionOpened(pair);}; //synchronous call // 
									//~ // check if position closed: !=0 to 0, then call onPositionClosed()
									if ((pre_pos!=0) && (cur_pos==0)) {onPositionClosed(pair);}; //synchronous call											
							});								
							// Shallow Object copy: copy  globalPositions -->  globalPositions_pre
							//globalPositions_pre = Object.assign({}, globalPositions);							
						};
						
											
					} 
				} 				
			}
		});	// kraken: ClosedOrders
},15*1000); // Requesting order data every 15 seconds. 

// clearInterval(alltradeevents); 



