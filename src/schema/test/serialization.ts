import tape = require('tape');
import { vec2, vec3, vec4 } from 'gl-matrix';
import {
    MuWriteStream,
    MuReadStream,
} from '../../stream';
import {
    MuSchema,
    MuBoolean,
    MuASCII,
    MuFixedASCII,
    MuUTF8,
    MuFloat32,
    MuFloat64,
    MuInt8,
    MuInt16,
    MuInt32,
    MuUint8,
    MuUint16,
    MuUint32,
    MuVarint,
    MuRelativeVarint,
    MuArray,
    MuOption,
    MuSortedArray,
    MuStruct,
    MuUnion,
    MuBytes,
    MuDictionary,
    MuVector,
    MuQuantizedVector,
    MuDate,
    MuJSON,
} from '../index';
import { MuString, MuStringType } from '../_string';
import { MuNumber } from '../_number';
import {
    randBool,
    randFloat32,
    randArray,
    randDict,
    randUint8,
} from '../util/random';

function createTest<T> (
    t:tape.Test,
    schema:MuSchema<T>,
) : (base:MuSchema<T>['identity'], target:MuSchema<T>['identity']) => void {
    return (base, target) => {
        const out = new MuWriteStream(1);
        if (schema.diff(base, target, out)) {
            t.notDeepEqual(base, target, 'diff() implied values are not identical');
            t.true(out.offset > 0, 'at least one byte should be written to stream');
            const inp = new MuReadStream(out.bytes());
            t.deepEqual(schema.patch(base, inp), target, 'patched value should be identical to target');
            t.equal(inp.offset, inp.length, 'patch() should consume all bytes on stream');
        } else {
            t.deepEqual(base, target, 'diff() implied values are identical');
            t.equal(out.offset, 0, 'no bytes should be written to stream');
        }
    };
}

const compare = (a, b) => a - b;

(<any>tape).onFailure(() => {
    process.exit(1);
});

tape('de/serializing boolean', (t) => {
    const bool = new MuBoolean();
    const test = createTest(t, bool);
    test(true, true);
    test(false, false);
    test(true, false);
    test(false, true);
    t.end();
});

tape('de/serializing string', (t) => {
    function createTestPair (
        t_:tape.Test,
        schema:MuString<MuStringType>,
    ) : (a:string, b:string) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, a);
            test(b, b);
            test(a, b);
            test(b, a);
            test('', a);
            test('', b);
        };
    }

    t.test('ascii', (st) => {
        const ascii = new MuASCII();
        const testPair = createTestPair(st, ascii);
        testPair('', ' ');
        testPair('a', 'b');
        testPair('a', '<a href="https://github.com/mikolalysenko/mudb/">mudb</a>');

        const codePoints = new Array(0x80);
        for (let i = 0; i < codePoints.length; ++i) {
            codePoints[i] = i;
        }
        testPair(
            String.fromCharCode.apply(null, codePoints),
            String.fromCharCode.apply(null, codePoints.reverse()),
        );
        st.end();
    });

    t.test('fixed-ascii', (st) => {
        const fixedAscii = new MuFixedASCII(32);
        const test = createTest(st, fixedAscii);
        test('https://github.com/mikolalysenko', 'https://github.com/mikolalysenko');
        test('e42dfecf821ebdfce692c7692b18d2b1', 'https://github.com/mikolalysenko');
        test('https://github.com/mikolalysenko', 'e42dfecf821ebdfce692c7692b18d2b1');
        st.end();
    });

    t.test('utf8', (st) => {
        const utf8 = new MuUTF8();
        const testPair = createTestPair(st, utf8);
        testPair('', ' ');
        testPair('<a href="https://github.com/mikolalysenko/mudb/">mudb</a>', 'Iñtërnâtiônàlizætiøn☃💩');
        testPair('<a href="https://github.com/mikolalysenko/mudb/">mudb</a>', '💩💩💩💩💩💩💩💩💩💩💩💩💩💩💩');

        let bigText = '啊啊啊';
        for (let i = 0; i < 16; ++i) {
            bigText += bigText;
        }
        testPair('<a href="https://github.com/mikolalysenko/mudb/">mudb</a>', bigText);
        st.end();
    });

    t.end();
});

tape('de/serializing number', (t) => {
    function createTestPair (
        t_:tape.Test,
        schema:MuNumber<any>,
    ) : (a:number, b:number) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, a);
            test(b, b);
            test(a, b);
            test(b, a);
        };
    }

    const testFloat32 = createTestPair(t, new MuFloat32());
    testFloat32(-3.4028234663852886e+38, 3.4028234663852886e+38);
    const testFloat64 = createTestPair(t, new MuFloat64());
    testFloat64(-1.7976931348623157e+308, 1.7976931348623157e+308);
    const testInt8 = createTestPair(t, new MuInt8());
    testInt8(-0x80, 0x7f);
    const testInt16 = createTestPair(t, new MuInt16());
    testInt16(-0x8000, 0x7fff);
    const testInt32 = createTestPair(t, new MuInt32());
    testInt32(-0x80000000, 0x7fffffff);
    const testUint8 = createTestPair(t, new MuUint8());
    testUint8(0, 0xff);
    const testUint16 = createTestPair(t, new MuUint16());
    testUint16(0, 0xffff);
    const testUint32 = createTestPair(t, new MuUint32());
    testUint32(0, 0xffffffff);

    t.end();
});

tape('de/serializing varint', (t) => {
    const sample = [ 1, 64, 128, 256, 1 << 14, 1 << 21, 1 << 28, 1 << 31 >>> 0 ];
    for (let i = sample.length - 1; i >= 0; --i) {
        const x = sample[i];
        sample.push(x - 1);
        sample.push(x + 1);
        sample.push((x + x * Math.random() | 0) >>> 0);
    }
    sample.push(0xffffffff);

    const testVarint = createTest(t, new MuVarint());
    for (let i = 0; i < sample.length; ++i) {
        const x = sample[i];
        testVarint(0, x);
        testVarint(x, x);
    }

    const testRelativeVarint = createTest(t, new MuRelativeVarint());
    for (let i = 0; i < sample.length; ++i) {
        const x = sample[i];
        testRelativeVarint(0, x);
        testRelativeVarint(x, 0);
        testRelativeVarint(x, x);
    }

    t.end();
});

tape('de/serializing array', (t) => {
    function createTestPair (
        t_:tape.Test,
        schema:MuArray<any>,
    ) : (a:any[], b:any[]) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, a);
            test(b, b);
            test(a, b);
            test(b, a);
            test([], a);
            test([], b);
        };
    }

    function randNestedArray () {
        const na = new Array(Math.random() * 10 | 0);
        for (let i = 0; i < na.length; ++i) {
            na[i] = randArray();
        }
        return na;
    }

    t.test('simple array', (st) => {
        const array = new MuArray(new MuFloat32(), Infinity);
        const testPair = createTestPair(st, array);
        testPair([0], [1]);
        testPair([0, 1], [1, 1]);
        testPair([0, 1], [0, 2]);
        testPair([0, 1], [0.5, 1.5]);
        testPair([0], [0, 1]);
        testPair([0, 1], [1, 2, 3]);
        for (let i = 0; i < 1000; ++i) {
            testPair(randArray(), randArray());
        }
        st.end();
    });

    t.test('nested array', (st) => {
        const array = new MuArray(
            new MuArray(new MuFloat32(), Infinity),
            Infinity,
        );
        const testPair = createTestPair(st, array);
        testPair([[]], [[], []]);
        for (let i = 0; i < 1000; ++i) {
            testPair(randNestedArray(), randNestedArray());
        }
        st.end();
    });

    t.end();
});

tape('de/serializing sorted array', (t) => {
    function createTestPair<T, Schema extends MuSchema<T>> (
        t_:tape.Test,
        schema:MuSortedArray<Schema>,
    ) : (a:T[], b:T[]) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            a.sort(compare);
            b.sort(compare);
            test(a, a);
            test(b, b);
            test(a, b);
            test(b, a);
            test([], a);
            test([], b);
            test(a, []);
            test(b, []);
        };
    }

    const sortedArray = new MuSortedArray(new MuFloat32(), Infinity);
    const testPair = createTestPair(t, sortedArray);
    testPair([], []);
    testPair([0], [1]);
    testPair([0, 1], [1, 1]);
    testPair([0, 1], [0, 2]);
    testPair([0, 1], [0.5, 1.5]);
    testPair([0], [0, 1]);
    testPair([0, 1], [1, 2, 3]);
    for (let i = 0; i < 1000; ++i) {
        testPair(randArray(), randArray());
    }

    const structSchema = new MuStruct({
        id: new MuUint32(0),
        garbage: new MuArray(new MuFloat64(10), Infinity),
        poop: new MuFloat32(0),
    });

    function randomStruct () {
        const s = structSchema.alloc();
        s.id = (Math.random() * 1000) | 0;
        s.garbage.length = 0;
        const ngarbage = Math.random() * 10;
        for (let i = 0; i < ngarbage; ++i) {
            s.garbage.push(Math.random());
        }
        s.poop = (Math.random() * 10) | 0;
        return s;
    }

    const arraySchema = new MuSortedArray(structSchema, Infinity, (a, b) => a.id - b.id);

    function randomArray () {
        const x = arraySchema.alloc();
        const n = (Math.random() * 100) | 0;
        for (let i = 0; i < n; ++i) {
            x.push(randomStruct());
        }
        x.sort(arraySchema.compare);
        return x;
    }

    const testStruct = createTestPair(t, arraySchema);

    testStruct([], []);
    for (let i = 0; i < 100; ++i) {
        const x = randomArray();
        const y = randomArray();
        testStruct(x, y);
        arraySchema.assign(x, []);
        arraySchema.free(y);
    }

    t.end();
});

tape('de/serializing struct', (t) => {
    function createTestPair<T extends {[prop:string]:MuSchema<any>}> (
        t_:tape.Test,
        schema:MuStruct<T>,
    ) : (a:MuStruct<T>['identity'], b:MuStruct<T>['identity']) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, a);
            test(b, b);
            test(a, b);
            test(b, a);
            test(schema.alloc(), a);
            test(schema.alloc(), b);
        };
    }

    const struct = new MuStruct({
        b: new MuBoolean(),
        u: new MuUTF8(),
        f: new MuFloat32(),
        a: new MuArray(new MuFloat32(), Infinity),
        sa: new MuSortedArray(new MuFloat32(), Infinity),
        v: new MuVector(new MuFloat32(), 9),
        d: new MuDictionary(new MuFloat32(), Infinity),
        s: new MuStruct({
            b: new MuBoolean(),
            u: new MuUTF8(),
            f: new MuFloat32(),
        }),
    });

    const strings = [
        '',
        '<a href="https://github.com/mikolalysenko/mudb/">mudb</a>',
        'Iñtërnâtiônàlizætiøn☃💩',
    ];

    function createStruct () {
        const s = struct.alloc();
        s.b = randBool();
        s.u = strings[Math.random() * 3 | 0];
        s.f = randFloat32();
        s.a = randArray();
        s.sa = randArray().sort(compare);
        s.v = randVec(9);
        s.d = randDict();
        s.s.b = randBool();
        s.s.u = strings[Math.random() * 3 | 0];
        s.s.f = randFloat32();
        return s;
    }

    const testPair = createTestPair(t, struct);
    for (let i = 0; i < 2000; ++i) {
        testPair(createStruct(), createStruct());
    }
    t.end();
});

tape('de/serializing struct of booleans', (t) => {
    function createTestPair<T extends {[prop:string]:MuSchema<any>}> (
        t_:tape.Test,
        schema:MuStruct<T>,
    ) : (a:MuStruct<T>['identity'], b:MuStruct<T>['identity']) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, a);
            test(b, b);
            test(a, b);
            test(b, a);
            test(schema.alloc(), a);
            test(schema.alloc(), b);
        };
    }

    function createStruct (schema) {
        const s = schema.alloc();
        Object.keys(s).forEach((key) => {
            s[key] = randBool();
        });
        return s;
    }

    const struct1 = new MuStruct({
        a: new MuBoolean(),
    });
    const struct2 = new MuStruct({
        a: new MuBoolean(),
        b: new MuBoolean(),
    });
    const struct8 = new MuStruct({
        a: new MuBoolean(),
        b: new MuBoolean(),
        c: new MuBoolean(),
        d: new MuBoolean(),
        e: new MuBoolean(),
        f: new MuBoolean(),
        g: new MuBoolean(),
        h: new MuBoolean(),
    });
    const struct9 = new MuStruct({
        a: new MuBoolean(),
        b: new MuBoolean(),
        c: new MuBoolean(),
        d: new MuBoolean(),
        e: new MuBoolean(),
        f: new MuBoolean(),
        g: new MuBoolean(),
        h: new MuBoolean(),
        i: new MuBoolean(),
    });
    const shape:{[key:string]:MuBoolean} = {};
    for (let i = 0; i < 1000; ++i) {
        shape[i] = new MuBoolean();
    }
    const struct = new MuStruct(shape);

    const testPair1 = createTestPair(t, struct1);
    testPair1({ a: true }, { a: false });
    const testPair2 = createTestPair(t, struct2);
    testPair2({ a: false, b: true }, { a: true, b: false });
    testPair2({ a: false, b: true }, { a: true, b: true });
    testPair2({ a: true, b: false }, { a: true, b: true });
    const testPair8 = createTestPair(t, struct8);
    for (let i = 0; i < 1000; ++i) {
        testPair8(createStruct(struct8), createStruct(struct8));
    }
    const testPair9 = createTestPair(t, struct9);
    for (let i = 0; i < 1000; ++i) {
        testPair9(createStruct(struct9), createStruct(struct9));
    }
    const testPair = createTestPair(t, struct);
    for (let i = 0; i < 1000; ++i) {
        testPair(createStruct(struct), createStruct(struct));
    }
    t.end();
});

tape('de/serializing union', (t) => {
    function createTestPair<T extends {[prop:string]:MuSchema<any>}> (
        t_:tape.Test,
        schema:MuUnion<T>,
    ) : (a:MuUnion<T>['identity'], b:MuUnion<T>['identity']) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, a);
            test(b, b);
            test(a, b);
            test(b, a);
        };
    }

    const spec = {
        b: new MuBoolean(),
        u: new MuUTF8(),
        f: new MuFloat32(),
        a: new MuArray(new MuFloat32(), Infinity),
        sa: new MuSortedArray(new MuFloat32(), Infinity),
        v: new MuVector(new MuFloat32(), 16),
        d: new MuDictionary(new MuFloat32(), Infinity),
    };
    const tags = Object.keys(spec) as (keyof typeof spec)[];
    const numTags = tags.length;

    const strings = [
        '',
        '<a href="https://github.com/mikolalysenko/mudb/">mudb</a>',
        'Iñtërnâtiônàlizætiøn☃💩',
    ];

    function randUnionCase () {
        const type = tags[Math.random() * numTags | 0];
        let data;
        switch (type) {
            case 'b':
                data = randBool();
                break;
            case 'u':
                data = strings[Math.random() * strings.length | 0];
                break;
            case 'f':
                data = randFloat32();
                break;
            case 'a':
                data = randArray();
                break;
            case 'sa':
                data = randArray().sort(compare);
                break;
            case 'v':
                data = randVec(16);
                break;
            case 'd':
                data = randDict();
                break;
        }
        return {
            type,
            data,
        };
    }

    const union = new MuUnion(spec);
    const testPair = createTestPair(t, union);
    for (let i = 0; i < 1000; ++i) {
        testPair(randUnionCase(), randUnionCase());
    }
    t.end();
});

tape('de/serializing bytes', (t) => {
    function createTestPair (
        t_:tape.Test,
        schema:MuBytes,
    ) : (a:Uint8Array, b:Uint8Array) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, b);
            test(b, a);
        };
    }

    function randUint8Array () {
        const a = new Uint8Array(Math.ceil(Math.random() * 100));
        for (let i = 0; i < a.length; ++i) {
            a[i] = randUint8();
        }
        return a;
    }

    const bytes = new MuBytes();
    const testPair =  createTestPair(t, bytes);
    testPair(new Uint8Array([]), randUint8Array());
    for (let i = 0; i < 1000; ++i) {
        const a = randUint8Array();
        const b = randUint8Array();
        if (!bytes.equal(a, b)) {
            testPair(a, b);
        }
    }
    t.end();
});

tape('de/serializing dictionary', (t) => {
    function createTestPair<T extends MuSchema<any>> (
        t_:tape.Test,
        schema:MuDictionary<T>,
    ) : (a:MuDictionary<T>['identity'], b:MuDictionary<T>['identity']) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, a);
            test(b, b);
            test(a, b);
            test(b, a);
            test({}, a);
            test({}, b);
        };
    }

    function randNestedDict () {
        const nd = {};
        let code = 97 + Math.random() * 6 | 0;
        for (let i = Math.random() * 6 | 0; i > 0; --i) {
            nd[String.fromCharCode(code++)] = randDict();
        }
        return nd;
    }

    t.test('simple dictionary', (st) => {
        const dictionary = new MuDictionary(new MuFloat32(), Infinity);
        const testPair = createTestPair(st, dictionary);
        testPair({f: 0}, {f: 0.5});
        testPair({f: 0, g: 0.5}, {f: 0, g: 1});
        testPair({f: 0, g: 0.5}, {f: 1, g: 0.5});
        testPair({f: 0, g: 0.5}, {f: 1, g: 1.5});
        testPair({f: 0}, {g: 0});
        testPair({f: 0}, {g: 0.5});
        testPair({f: 0, g: 0.5}, {g: 1, h: 1.5});
        testPair({f: 0, g: 0.5}, {h: 1, i: 1.5});
        testPair({f: 0}, {f: 0, g: 0.5});
        testPair({f: 0}, {f: 0.5, g: 1});
        for (let i = 0; i < 1000; ++i) {
            testPair(randDict(), randDict());
        }
        st.end();
    });

    t.test('nested dictionary', (st) => {
        const dictionary = new MuDictionary(
            new MuDictionary(new MuFloat32(), Infinity),
            Infinity,
        );
        const testPair = createTestPair(st, dictionary);
        testPair({a: {a: 0}}, {a: {b: 0.5}});
        testPair({a: {a: 0}, b: {a: 0}}, {a: {a: 0}, b: {b: 0.5}});
        testPair({a: {a: 0}, b: {a: 0}}, {a: {b: 0.5}, b: {a: 0}});
        testPair({a: {a: 0}, b: {a: 0}}, {a: {b: 0.5}, b: {b: 0.5}});
        testPair({a: {a: 0}}, {b: {a: 0}});
        testPair({a: {a: 0}}, {b: {b: 0}});
        testPair({a: {a: 0}, b: {a: 0}}, {b: {b: 0.5}, c: {a: 0}});
        testPair({a: {a: 0}, b: {a: 0}}, {c: {a: 0}, d: {a: 0}});
        testPair({a: {a: 0}}, {a: {b: 0.5}, b: {a: 0}});
        testPair({a: {a: 0}}, {b: {a: 0.5}, c: {a: 0.5}});
        for (let i = 0; i < 1000; ++i) {
            testPair(randNestedDict(), randNestedDict());
        }
        st.end();
    });

    t.end();
});

function randVec<D extends number> (dimension:D) : MuVector<MuNumber<any>, D>['identity'] {
    const v = new MuVector(new MuFloat32(), dimension).alloc();
    for (let i = 0; i < v.length; ++i) {
        v[i] = randFloat32();
    }
    return v;
}

tape('de/serializing vector', (t) => {
    function createTestPair<Schema extends MuVector<any, number>> (
        t_:tape.Test,
        schema:Schema,
    ) : (a:Schema['identity'], b:Schema['identity']) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, a);
            test(b, b);
            test(a, b);
            test(b, a);
            test(schema.alloc(), a);
            test(schema.alloc(), b);
        };
    }

    t.test('vec0', (st) => {
        const vector = new MuVector(new MuFloat32(), 0);
        const test = createTest(st, vector);
        const zeroA = vector.alloc();
        const zeroB = vector.alloc();
        test(zeroA, zeroB);
        st.end();
    });

    t.test('vec1', (st) => {
        const vector = new MuVector(new MuFloat32(), 1);
        const testPair = createTestPair(st, vector);
        for (let i = 0; i < 10; ++i) {
            testPair(randVec(1), randVec(1));
        }
        st.end();
    });

    t.test('vec2', (st) => {
        const vector = new MuVector(new MuFloat32(), 2);
        const testPair = createTestPair(st, vector);
        for (let i = 0; i < 100; ++i) {
            testPair(randVec(2), randVec(2));
        }
        st.end();
    });

    t.test('vec3', (st) => {
        const vector = new MuVector(new MuFloat32(), 3);
        const testPair = createTestPair(st, vector);
        for (let i = 0; i < 1000; ++i) {
            testPair(randVec(3), randVec(3));
        }
        st.end();
    });

    t.test('vec10000', (st) => {
        const vector = new MuVector(new MuFloat32(), 10000);
        const testPair = createTestPair(st, vector);
        for (let i = 0; i < 10; ++i) {
            testPair(randVec(10000), randVec(10000));
        }
        st.end();
    });

    t.end();
});

tape('quantized-vec2', function (t) {
    function testDiffPatch (x:vec2, y:vec2, schema:MuQuantizedVector<2>) {
        const write = new MuWriteStream(100);
        if (!schema.diff(x, y, write)) {
            t.equal(write.offset, 0, 'did not write bytes');
            return t.ok(schema.equal(x, y), 'equal');
        }
        const read = new MuReadStream(write.buffer.uint8);
        const z = schema.patch(x, read);
        t.ok(schema.equal(z, y), `diff-patch: ${vec2.str(x)} -> $${vec2.str(y)} got: ${vec2.str(z)} @ precision ${schema.precision}`);
        t.equal(read.offset, write.offset, 'used all of stream');
    }

    function testRound (x:vec2, schema:MuQuantizedVector<2>) {
        const z = schema.alloc();
        t.equals(schema.assign(z, x), z, 'assign returns correct value');

        for (let i = 0; i < 2; ++i) {
            t.ok(Math.abs(z[i] - x[i]) <= schema.precision, 'round');
        }
        t.ok(schema.equal(x, z), 'equals method works');
    }

    function testPair (x:vec2, y:vec2, schema:MuQuantizedVector<2>) {
        testRound(x, schema);
        testRound(y, schema);
        testDiffPatch(x, y, schema);
        testDiffPatch(y, x, schema);
        testDiffPatch(schema.identity, x, schema);
        testDiffPatch(schema.identity, y, schema);
        testDiffPatch(x, schema.identity, schema);
        testDiffPatch(y, schema.identity, schema);
    }

    function makeTestSchema (precision:number, identity:vec2) {
        const schema = new MuQuantizedVector(2, precision, identity);
        t.equal(schema.precision, precision, 'precision');
        testRound(identity, schema);
        t.ok(schema.equal(identity, schema.identity), 'identity');
        return schema;
    }

    function randVec2 () {
        return vec2.fromValues(
            10 * (Math.random() - 0.5),
            10 * (Math.random() - 0.5));
    }

    for (let scale = 0.25; scale <= 2; scale += 0.25) {
        const schema0 = makeTestSchema(scale, vec2.create());
        const schema1 = makeTestSchema(scale, vec2.fromValues(1, 1));
        for (let i = 0; i < 40; ++i) {
            const x = randVec2();
            const y = randVec2();
            testPair(x, y, schema0);
            testPair(x, y, schema1);

            x[0] = y[0];
            testPair(x, y, schema0);
            testPair(x, y, schema1);

            x[1] = y[1];
            testPair(x, y, schema0);
            testPair(x, y, schema1);

            x[0] = 10. * Math.random();
            testPair(x, y, schema0);
            testPair(x, y, schema1);
        }
    }

    t.end();
});

tape('quantized-vec3', function (t) {
    function testDiffPatch (x:vec3, y:vec3, schema:MuQuantizedVector<3>) {
        const write = new MuWriteStream(100);
        if (!schema.diff(x, y, write)) {
            t.equal(write.offset, 0, 'did not write bytes');
            return t.ok(schema.equal(x, y), 'equal');
        }
        const read = new MuReadStream(write.buffer.uint8);
        const z = schema.patch(x, read);
        t.ok(schema.equal(z, y), `diff-patch: ${vec3.str(x)} -> $${vec3.str(y)} got: ${vec3.str(z)} @ precision ${schema.precision}`);
        t.equal(read.offset, write.offset, 'used all of stream');
    }

    function testRound (x:vec3, schema:MuQuantizedVector<3>) {
        const z = schema.alloc();
        t.equals(schema.assign(z, x), z, 'assign returns correct value');

        for (let i = 0; i < 3; ++i) {
            t.ok(Math.abs(z[i] - x[i]) <= schema.precision, 'round');
        }
        t.ok(schema.equal(x, z), 'equals method works');
    }

    function testPair (x:vec3, y:vec3, schema:MuQuantizedVector<3>) {
        testRound(x, schema);
        testRound(y, schema);
        testDiffPatch(x, y, schema);
        testDiffPatch(y, x, schema);
        testDiffPatch(schema.identity, x, schema);
        testDiffPatch(schema.identity, y, schema);
        testDiffPatch(x, schema.identity, schema);
        testDiffPatch(y, schema.identity, schema);
    }

    function makeTestSchema (precision:number, identity:vec3) {
        const schema = new MuQuantizedVector(3, precision, identity);
        t.equal(schema.precision, precision, 'precision');
        testRound(identity, schema);
        t.ok(schema.equal(identity, schema.identity), 'identity');
        return schema;
    }

    function randVec3 () {
        return vec3.fromValues(
            10 * (Math.random() - 0.5),
            10 * (Math.random() - 0.5),
            10 * (Math.random() - 0.5));
    }

    for (let scale = 0.25; scale <= 2; scale += 0.25) {
        const schema0 = makeTestSchema(scale, vec3.create());
        const schema1 = makeTestSchema(scale, vec3.fromValues(1, 1, 1));
        for (let i = 0; i < 40; ++i) {
            const x = randVec3();
            const y = randVec3();
            testPair(x, y, schema0);
            testPair(x, y, schema1);

            x[0] = y[0];
            testPair(x, y, schema0);
            testPair(x, y, schema1);

            x[1] = y[1];
            testPair(x, y, schema0);
            testPair(x, y, schema1);

            x[0] = 10. * Math.random();
            testPair(x, y, schema0);
            testPair(x, y, schema1);

            x[2] = y[2];
            testPair(x, y, schema0);
            testPair(x, y, schema1);

            x[1] = 10. * Math.random();
            testPair(x, y, schema0);
            testPair(x, y, schema1);

            x[0] = y[0];
            x[1] = 10. * Math.random();
            testPair(x, y, schema0);
            testPair(x, y, schema1);
        }
    }

    t.end();
});

tape('quantized-vec4', function (t) {
    function testDiffPatch (x:vec4, y:vec4, schema:MuQuantizedVector<4>) {
        const write = new MuWriteStream(100);
        if (!schema.diff(x, y, write)) {
            t.equal(write.offset, 0, 'did not write bytes');
            return t.ok(schema.equal(x, y), 'equal');
        }
        const read = new MuReadStream(write.buffer.uint8);
        const z = schema.patch(x, read);
        t.ok(schema.equal(z, y), `diff-patch: ${vec4.str(x)} -> $${vec4.str(y)} got: ${vec4.str(z)} @ precision ${schema.precision}`);
        t.equal(read.offset, write.offset, 'used all of stream');
    }

    function testRound (x:vec4, schema:MuQuantizedVector<4>) {
        const z = schema.alloc();
        t.equals(schema.assign(z, x), z, 'assign returns correct value');

        for (let i = 0; i < 4; ++i) {
            t.ok(Math.abs(z[i] - x[i]) <= schema.precision, 'round');
        }
        t.ok(schema.equal(x, z), 'equals method works');
    }

    function testPair (x:vec4, y:vec4, schema:MuQuantizedVector<4>) {
        testRound(x, schema);
        testRound(y, schema);
        testDiffPatch(x, y, schema);
        testDiffPatch(y, x, schema);
        testDiffPatch(schema.identity, x, schema);
        testDiffPatch(schema.identity, y, schema);
        testDiffPatch(x, schema.identity, schema);
        testDiffPatch(y, schema.identity, schema);
    }

    function makeTestSchema (precision:number, identity:vec4) {
        const schema = new MuQuantizedVector(4, precision, identity);
        t.equal(schema.precision, precision, 'precision');
        testRound(identity, schema);
        t.ok(schema.equal(identity, schema.identity), 'identity');
        return schema;
    }

    function randVec4 () {
        return vec4.fromValues(
            10 * (Math.random() - 0.5),
            10 * (Math.random() - 0.5),
            10 * (Math.random() - 0.5),
            10 * (Math.random() - 0.5));
    }

    for (let scale = 0.25; scale <= 2; scale += 0.25) {
        const schema0 = makeTestSchema(scale, vec4.create());
        const schema1 = makeTestSchema(scale, vec4.fromValues(1, 1, 1, 1));
        for (let i = 0; i < 40; ++i) {
            for (let k = 0; k << (1 << 4); ++k) {
                const nx = randVec4();
                const ny = randVec4();
                for (let j = 0; j < 4; ++j) {
                    if (k & (1 << j)) {
                        ny[j] = nx[j];
                    }
                }
                testPair(nx, ny, schema0);
                testPair(nx, ny, schema1);
            }
        }
    }

    t.end();
});

tape('de/serializing date', (t) => {
    const date = new MuDate();
    const test = createTest(t, date);
    const d1 = date.alloc();
    const d2 = date.alloc();
    d2.setTime(0);
    test(d1, d1);
    test(d2, d2);
    test(d1, d2);
    test(d2, d1);
    t.end();
});

tape('de/serializing json', (t) => {
    function createTestPair (
        t_:tape.Test,
        schema:MuJSON,
    ) : (a:object, b:object) => void {
        const test = createTest(t_, schema);
        return (a, b) => {
            test(a, b);
            test(b, a);
        };
    }

    const json = new MuJSON();
    const testPair = createTestPair(t, json);
    testPair({}, {a:0.5, b:false, c:'', d:[]});
    testPair([], [1e9, true, 'Iñtërnâtiônàlizætiøn☃💩', {}]);
    t.end();
});

tape('de/serializing option', (t) => {
    const op = new MuOption(new MuFloat32()); // optional primitive
    const of = new MuOption(new MuStruct({op: op})); // optional functor

    const testPrimitive = createTest(t, op);
    testPrimitive(undefined, undefined);
    testPrimitive(undefined, 4);
    testPrimitive(4, undefined);
    testPrimitive(undefined, 0);
    testPrimitive(0, undefined);
    testPrimitive(4, 4);
    testPrimitive(3, 4);

    const testFunctor = createTest(t, of);
    testFunctor(undefined, undefined);
    testFunctor({op: undefined}, undefined);
    testFunctor(undefined, {op: undefined});
    testFunctor({op: 4}, undefined);
    testFunctor(undefined, {op: 4});
    testFunctor({op: 4}, {op: 3});
    testFunctor({op: 4}, {op: 4});
    testFunctor({op: 0}, {op: 4});
    testFunctor({op: 4}, {op: 0});
    testFunctor({op: undefined}, {op: 0});
    testFunctor({op: 0}, {op: undefined});
    testFunctor(undefined, {op: 0});
    testFunctor({op: 0}, undefined);

    t.end();
});
