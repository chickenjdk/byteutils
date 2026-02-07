# Things to test
## Writable
### Resizing functionality
- [x] Check if it correctly handles both types of arrays spanning a partial chunk
- [x] Check if it correctly handles both types of arrays spanning many whole chunks
- [x] Check if it correctly handles both types of arrays spanning many whole chunks and a partial chunk
- [ ] No mutation happens to the source buffers on any calls

## Streams
### Readable
#### Order of reads
- [x] Reads give data in correct order when you are reading from ONE chunk

#### Over reads
- [x] Over read while lock is acquired and no data is present
- [x] Over read while lock is acquired and some data but not full data is present
- [x] Over read while one call has enough data while a second does not

#### Normal behavior
- [x] Works like normal when source is ended but enough data is present
- [ ] Drain events are called at the correct time
- [ ] Drained property is correctly set

### Writable
