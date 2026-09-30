import {db} from '../../../lib/db';
import {createGameHandler} from '../../../lib/game-service';
export const dynamic='force-dynamic';
const handler=createGameHandler({db});
export const GET=handler;
export const POST=handler;
