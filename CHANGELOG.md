# 1.0.x

Version 1.0.5 In distributed actor systems, the name-Property of the actor ref did not represent the original caller. This was fixed.

Version 1.0.4 Several small bugfixes, but no change in functionality. Especially sending distributed asks directly over a system instead from inside an actor now works properly.

Version 1.0.0 is a major overall which includes updates to most dependencies, rewrite of inner functions and a first version of a distributed actor system. In addition, all dependencies that were not
absolutely neccessary (including tsmonads and winston) have been removed. `ts-actors` now only depends on `ramda`, `uuid`, and `rxjs`.
