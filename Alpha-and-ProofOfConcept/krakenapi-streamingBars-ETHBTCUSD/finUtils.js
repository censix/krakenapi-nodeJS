

module.exports = {

// Reshape OHLCV data from kraken format to ta-lib format
reshapeOHLC: function(kraken_ohlc) {
	var uS= require('underscore');
	res = {time:[], Op:[], Hi:[], Lo:[], Cl:[], VWAP:[], Vo:[], Count:[]};
	uS.each(kraken_ohlc, function(el,id,li){ 
		res.time.push(el[0]);
		res.Op.push(el[1]);
		res.Hi.push(el[2]);	
		res.Lo.push(el[3]);	
		res.Cl.push(el[4]);	
		res.VWAP.push(el[5]);		
		res.Vo.push(el[6]);	
		res.Count.push(el[7]);			
	});
	return(res);
}
//talib_ohlc = reshapeOHLC(ohlc['XETHZEUR']);



}
