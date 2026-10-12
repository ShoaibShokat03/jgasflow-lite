import { Global, Module } from '@nestjs/common';
import { Db } from './db.service';

/** One MySQL pool for the whole API. */
@Global()
@Module({ providers: [Db], exports: [Db] })
export class DbModule {}
