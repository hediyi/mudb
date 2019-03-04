import {
  MuStruct,
  MuDictionary,
  MuUTF8,
  MuFloat64,
  MuInt8,
  MuArray,
  MuBoolean,
} from 'mudb/schema';
import { pair } from 'mudb/type';

export const PlayerSchema = new MuStruct({
  team: new MuInt8(),
  x: new MuFloat64(),
  y: new MuFloat64(),
});

export const FlagSchema = new MuStruct({
  team: new MuInt8(),
  x: new MuFloat64(),
  y: new MuFloat64(),
});

export const StateSchema = {
  client: PlayerSchema,
  server: new MuStruct({
    player: new MuDictionary(PlayerSchema, Infinity),
    flag: new MuArray(FlagSchema, Infinity),
  }),
};

export const MsgSchema = {
  client: {
    score: new MuArray(new MuInt8(), Infinity),
    dead: new MuUTF8(),
  },
  server: {

  },
};

export const RpcSchema = {
  client: {
    joinTeam: pair(new MuUTF8(), new MuInt8()),
  },
  server: {
    joinTeam: pair(new MuUTF8(), new MuInt8()),
  },
};
