This is a pure NodeJS script.

When started, this strategy builds a symmetrical price ladder (30 steps up and 30 steps down from the current price)
by placing limit orders in the ETHUSD orderbook. When a buy order is filled it is automatically replaced with a sell order.
When a sell order is filled it is automatically replaced with a buy order. The strategy terminates whenever the position
is back to zero.
