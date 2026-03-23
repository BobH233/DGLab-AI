import { MongoClient } from "mongodb";
import { buildTtsAudioContentKeyFromRecord } from "../services/TtsService.js";
import type { TtsAudioCacheRecord } from "../types/contracts.js";

async function main() {
  const mongoUri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
  const dbName = process.env.MONGODB_DB ?? "dglab_ai";
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const collection = client.db(dbName).collection<TtsAudioCacheRecord>("tts_audio_cache");
    const records = await collection.find({}, { projection: { _id: 0 } }).toArray();

    let updated = 0;
    let alreadyUpToDate = 0;

    for (const record of records) {
      const contentKey = buildTtsAudioContentKeyFromRecord(record);
      if (record.contentKey === contentKey) {
        alreadyUpToDate += 1;
        continue;
      }

      await collection.updateOne(
        { key: record.key },
        { $set: { contentKey } }
      );
      updated += 1;
    }

    console.log(JSON.stringify({
      ok: true,
      scanned: records.length,
      updated,
      alreadyUpToDate
    }));
  } finally {
    await client.close();
  }
}

await main();
