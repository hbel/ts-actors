# Minimal, Akka-styled actor system for TypeScript

Actors provide a secure, hierarchical way to deal with concurrent processing and to build reliable highly-concurrent systems. All actors are strictly separted state machines that communicate
via messages to pass data. Therefore, no race conditions can occur. Additionally, actors are hierarchically organized which allows _supervising_ actors to deal with errors in a reliable way. Especially,
it should be easy to restart actors that have crashed due to an error without risking a total crash of the program.

If you want to learn more about Actor System, check [Actor Model in Wikipedia](https://en.wikipedia.org/wiki/Actor_model) or the [Introduction to Actors from the Akka docs](https://doc.akka.io/docs/akka/current/general/actor-systems.html).

**Important** - Version 2.x includes several bugfixes and changed a lot of functions to behave properly in an asynchronous way. To migrate, you now have to deal with returned Promises on several occasions:

## Migration guide (to 2.x)

1. Lifecycle methods in Actor are now asynchronous and have to return `Promise<void>`.
2. `Actor.restart()` and `Actor.shutdown()` are now asynchronous.
3. The creation of new actors is now asynchronous. Therefore, `ActorSystem.create()` now returns a promise. The actor is guaranteed to be fully functional and started when you `await` its creation.
4. Shutting down an actor system now is also an asynchronous operation. If you `await ActorSystem.shutdown()`, the whole system will now be shut down properly before returning.
5. NatsDistributor has to be imported via its File path. It's not a part of the index file of the lib, so its dependency on nats does not pollute the libs dependencies if you only want to use it locally.

# Usage

Define your own actors by deriving from the `Actor` class and overriding the asynchronous `receive` method. Don't forget to also add an constructor which at least takes two parameters
for the actor name and actor system and uses them to initialize the base class:

```
constructor(name: string, system: ActorSystem) {
    super(name, system);
}
```

You are free to add additonal parameters to the constructor if you like. If you also want to react to the actor's lifecycle, simply override the `beforeStart, afterState, beforeShutdown` or `afterShutdown` methods.

To use ts-actors, first create an `ActorSystem`. Then, create instances of your Actor types by using the system's `createActor` method. This method takes at least one parameter, which is the Actor type. An optional second parameter is of the type `ActorOptions` and allows you to define the actors name, supervisin strategy, and parent actor in the actor hierarchy. Any parameters given after
that will be used as additional parameters to your actor's constructor.

When terminating your program, shut down the Actor system to guarantee that all actors will terminate gracefully.

See the libraries test and example folders for additional examples and instructions.

# Tips

-   [unionize](https://github.com/pelotom/unionize) sum types are the perfect match for dealing with Actor messages.
-   If your project uses [winston](https://github.com/winstonjs/winston) for logging, just call the ActorSystem constructor with your logger. It will not only provide additional
    logging information during runtime, but the logger will also be available in all your actors.

# Limitations

-   The current implementations does not use (Web)-Workers and therefore works asynchronously, but still on a single thread.
-   Due to restrictions in TypeScript's type system, `createActor` does currently not typecheck it's parameters.
