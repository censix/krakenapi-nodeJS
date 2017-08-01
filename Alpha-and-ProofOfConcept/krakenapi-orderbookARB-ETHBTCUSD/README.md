This is a pure NodeJS strategy. No R code is required. 

It calculates a spread between three price pairs as follows, then trades when large positive or negative deviations happen.

      Spread = log(ETHUSD) - (log(ETHBTC) + log(BTCUSD))
