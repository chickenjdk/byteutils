TODOS
- [x] Add buffers
- [x] Add async support to writableBuffer + find a way to not require two separate classes (For both) 
- [ ] Add tests (Use jest OR node:test)
- [ ] Use chunk buffer in readableStream
- [ ] Change casing of class names, and make the old ones aliases
- [ ] Change signed integer name to signed power to clarify (deprecate old naming)
NEXT MAJOR VERSION:
- [ ] The whole maybe async thing is a mess, use definite async or not provided to the constructors in the base class and export that into a property (still will need the callback wrappers sadly)
- [ ] Revamp streams (make complete non-nodejs dependant implementation. Include adapters for web streams and node.js streams. Include transform streams (a wrapper with a property containing the readable stream, and one containing the writable.), tee streams (split one input readable into many, keeping the chunks until they are used by all consumers), readable, writable, and of course pipelines) make pull streams, not push streams
