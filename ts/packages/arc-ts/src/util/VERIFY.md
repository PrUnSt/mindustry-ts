# arc-ts util 测试验证

## 命令

npx vitest run src/util --reporter=verbose

## 结果

Test Files  8 passed (8)
     Tests  85 passed (85)

## 逐文件/逐用例结果
 ✓ src/util/Structs.test.ts > Structs > eq uses ==/equals semantics
 ✓ src/util/Structs.test.ts > Structs > arr/swap/add/remove
 ✓ src/util/Structs.test.ts > Structs > find/contains/count/indexOf
 ✓ src/util/Structs.test.ts > Structs > filter mutates in place
 ✓ src/util/Structs.test.ts > Structs > each/forEach
 ✓ src/util/Structs.test.ts > Structs > findMin with comparator and float extractor
 ✓ src/util/Structs.test.ts > Structs > comparing/comps/comparingFloat/comparingInt/comparingBool
 ✓ src/util/Structs.test.ts > Structs > inBounds overloads
 ✓ src/util/io/Streams.test.ts > Streams > copy copies all bytes
 ✓ src/util/io/Streams.test.ts > Streams > copy with default buffer size
 ✓ src/util/io/Streams.test.ts > Streams > copyBytes reads all remaining bytes
 ✓ src/util/io/Streams.test.ts > Streams > copyString decodes UTF-8
 ✓ src/util/io/Streams.test.ts > Streams > copyProgress reports progress 0..1
 ✓ src/util/io/Streams.test.ts > Streams > OptimizedByteArrayOutputStream returns internal buffer when full
 ✓ src/util/io/Streams.test.ts > Streams > OptimizedByteArrayOutputStream grows
 ✓ src/util/io/Streams.test.ts > Streams > close ignores errors
 ✓ src/util/io/Streams.test.ts > Streams > emptyBytes constant
 ✓ src/util/Pools.test.ts > Pool > obtain creates new objects when empty
 ✓ src/util/Pools.test.ts > Pool > free then obtain reuses the same instance and resets it
 ✓ src/util/Pools.test.ts > Pool > max limits the number of free objects
 ✓ src/util/Pools.test.ts > Pool > clear empties free objects
 ✓ src/util/Pools.test.ts > Pool > freeAll pools multiple objects
 ✓ src/util/Pools.test.ts > Pools > obtain/free reuse instances per class
 ✓ src/util/Pools.test.ts > Pools > free of an unknown object is ignored
 ✓ src/util/Pools.test.ts > Pools > freeAll with and without samePool
 ✓ src/util/Pools.test.ts > Pools > free throws on null
 ✓ src/util/Time.test.ts > Time > update() advances time by delta
 ✓ src/util/Time.test.ts > Time > setDeltaProvider controls delta
 ✓ src/util/Time.test.ts > Time > run() executes after the delay and is removed
 ✓ src/util/Time.test.ts > Time > run() with a larger delay does not fire early
 ✓ src/util/Time.test.ts > Time > clear() cancels pending runs
 ✓ src/util/Time.test.ts > Time > mark()/elapsed() reports elapsed milliseconds
 ✓ src/util/Time.test.ts > Time > DelayRun is pooled and reused
 ✓ src/util/Time.test.ts > Time > conversion factors and nanos helpers
 ✓ src/util/Time.test.ts > Time > getInternalTime/setInternalTime round-trips
 ✓ src/util/Strings.test.ts > Strings > format substitutes @ placeholders
 ✓ src/util/Strings.test.ts > Strings > format stringifies arrays like Java Arrays.toString/deepToString
 ✓ src/util/Strings.test.ts > Strings > join joins with a separator
 ✓ src/util/Strings.test.ts > Strings > capitalize/camelize/kebab conversions
 ✓ src/util/Strings.test.ts > Strings > truncate and count
 ✓ src/util/Strings.test.ts > Strings > bytesToHex
 ✓ src/util/Strings.test.ts > Strings > parseInt variants
 ✓ src/util/Strings.test.ts > Strings > parseFloat/parseDouble variants
 ✓ src/util/Strings.test.ts > Strings > fixed/autoFixed
 ✓ src/util/Strings.test.ts > Strings > formatMillis
 ✓ src/util/Strings.test.ts > Strings > replace replaces all literal occurrences
 ✓ src/util/Strings.test.ts > Strings > sanitizeFilename / isSafeFilename
 ✓ src/util/Strings.test.ts > Strings > levenshtein and biasedLevenshtein
 ✓ src/util/Strings.test.ts > Strings > getFileName/getFileNameWithoutExtension/getFileExtension
 ✓ src/util/Strings.test.ts > Strings > matches is case-insensitive and empty-query is always true
 ✓ src/util/Strings.test.ts > Strings > sanitizeVersion / checkNewerSemver
 ✓ src/util/Strings.test.ts > Strings > encode mirrors Java URLEncoder
 ✓ src/util/Strings.test.ts > Strings > stripColors handles hex tags and escapes
 ✓ src/util/Strings.test.ts > Strings > stripGlyphs removes private use area
 ✓ src/util/Strings.test.ts > Strings > neatError/getCauses/getFinalCause over Error cause chains
 ✓ src/util/Log.test.ts > Log > info logs formatted text through the handler
 ✓ src/util/Log.test.ts > Log > level filtering suppresses lower-priority calls
 ✓ src/util/Log.test.ts > Log > infoTag/errTag prefix the tag
 ✓ src/util/Log.test.ts > Log > infoList joins with spaces
 ✓ src/util/Log.test.ts > Log > debug/info accept a bare object
 ✓ src/util/Log.test.ts > Log > addColors/removeColors round-trip color tags
 ✓ src/util/Log.test.ts > Log > format applies colors when useColors is true
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > integers: byte/short/int boundaries
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > unsigned reads: ub/us
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > longs (big-endian 64-bit)
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > floats and doubles
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > booleans
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > UTF strings: ascii, NUL, CJK, emoji surrogate pairs
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > str(maxLen) rejects oversized strings
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > byte arrays
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > checkEOF returns -1 at end and byte otherwise
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > skip advances the position
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > reads and writes byte order matches Java (big-endian)
 ✓ src/util/io/WritesReads.test.ts > Writes/Reads round trip > UTF length prefix is big-endian
 ✓ src/util/noise/Noise.test.ts > Simplex > noise2d is deterministic for the same seed
 ✓ src/util/noise/Noise.test.ts > Simplex > noise2d differs across seeds
 ✓ src/util/noise/Noise.test.ts > Simplex > raw2d returns values in [-1, 1]
 ✓ src/util/noise/Noise.test.ts > Simplex > noise3d is deterministic for the same seed
 ✓ src/util/noise/Noise.test.ts > Simplex > raw3d is deterministic
 ✓ src/util/noise/Noise.test.ts > Simplex > noise4d/raw4d/rawTiled are deterministic
 ✓ src/util/noise/Noise.test.ts > Simplex > perm/perm2 hash is deterministic
 ✓ src/util/noise/Noise.test.ts > Noise > default seed 100 produces stable output across calls
 ✓ src/util/noise/Noise.test.ts > Noise > setSeed makes the generator deterministic
 ✓ src/util/noise/Noise.test.ts > Noise > different seeds give different output
 ✓ src/util/noise/Noise.test.ts > Noise > 1D and 3D noise are deterministic
 Test Files  8 passed (8)
      Tests  85 passed (85)
   Duration  576ms (transform 492ms, setup 0ms, collect 784ms, tests 118ms, environment 2ms, prepare 1.16s)
## 结论

arc-ts util 包全部 85 个测试通过（8 个测试文件），无 esbuild "Duplicate member" 警告；已修复 Writes.b/Reads.b 重载导致的栈溢出、Simplex.raw2d 的 NaN、Log.err 重载崩溃、Streams.copyBytes 死循环/挂起，以及 Structs/Strings/Pools/Time/WritesReads 中由重复成员与错误断言引起的失败。
