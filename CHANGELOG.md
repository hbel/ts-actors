# 3.1.0

-   Allow ActorRefs to send directly to Actor URI instead of ActorRef instances

# 3.0.4

-   Optionally Sstting sec-websocket-protocol Authorization tokens in WebsocketDistributor is now possible in nodejs and browsers

# 3.0.3

-   Fixed an error in when no headers to Websocket construction

# 3.0.2

-   Made the url settings for client actor systems using a WebsocketDistributor more flexible, e.g. to send query parameters to the server system.

# 3.0.1

-   Fixed an issue with authorized websockets. The error event looks different on the client side
-   Removed double initialisation in DistributedActorSystem

# 3.0.0

-   Couple of bugfixes for the distributed actor system.
-   Actor systems are now instantiated asynchronously via factory functions.
-   Removed ramda in favor of rambda.
-   Fixed wrong status flag for run status of an actor system that was shut down.
-   Fixed the error handling for ask timeouts (now a proper rejected promise is returned).

# 2.3.2

-   Fixed an error in WebsocketDistributor that not properly handled an exception on sending messages.
-   Added a sample that communicates dynamic data (e.g. to a web application)

# 2.3.0

Updates to WebsocketDistributor interface and functionality. You now need to provide a nodejs server object for the proxy. And you can provide an auth middleware for upgrading websocket requests.

# 2.2.0

DistributedActorSystems may now also use WebSockets for Communications, so you no longer need to rely on NATS for transport. This distributor also works in the browser.

# 1.0.x

Version 1.0.5 In distributed actor systems, the name-Property of the actor ref did not represent the original caller. This was fixed.

Version 1.0.4 Several small bugfixes, but no change in functionality. Especially sending distributed asks directly over a system instead from inside an actor now works properly.

Version 1.0.0 is a major overall which includes updates to most dependencies, rewrite of inner functions and a first version of a distributed actor system. In addition, all dependencies that were not
absolutely neccessary (including tsmonads and winston) have been removed. `ts-actors` now only depends on `ramda`, `uuid`, and `rxjs`.
