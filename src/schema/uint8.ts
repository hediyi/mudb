import { MuWriteStream, MuReadStream } from '../stream';
import { MuNumber } from './_number';

export class MuUint8 extends MuNumber {
    constructor(identity?:number) {
        super((identity || 0) & 0xFF, 'uint8');
    }

    public diff (base:number, target:number, out:MuWriteStream) {
        if ((base & 0xff) !== (target & 0xff)) {
            out.grow(1);
            out.writeUint8(target);
            return true;
        }
        return false;
    }

    public patch (_:number, inp:MuReadStream) {
        return inp.readUint8();
    }
}
