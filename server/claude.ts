import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic prompt caching yardimcisi - projedeki TEK yer.
 *
 * Onbellek bir onek eslesmesidir: tools -> system -> messages sirasinda
 * tek bir bayt degisirse sonrasi yeniden islenir. Bu yuzden:
 *   - Sabit kisim (persona talimati) once gelir ve isaretlenir.
 *   - Istege gore degisen kisim (kullanici hafizasi vb.) ondan SONRA,
 *     ayri bir system blogu olarak eklenir.
 *
 * Model minimumlarinin altindaki onekler sessizce onbelleklenmez (hata yok,
 * ek ucret yok): claude-sonnet-4-5 = 1024, claude-haiku-4-5 = 4096 token.
 */

const EPHEMERAL = { type: "ephemeral" } as const;

/** Sabit blok isaretli, dinamik blok isaretsiz system dizisi. */
export function cachedSystem(staticText: string, dynamicText = ""): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: staticText, cache_control: EPHEMERAL },
  ];
  if (dynamicText) blocks.push({ type: "text", text: dynamicText });
  return blocks;
}

export interface CacheOptions {
  /**
   * Ust duzey otomatik caching: kesme noktasi son bloga konur ve sohbet
   * buyudukce ileri kayar. Cok turlu sohbetler icin (gecmis yalnizca
   * sona ekleniyorsa).
   */
  auto?: boolean;
}

function logUsage(label: string, model: string, usage: Anthropic.Usage | undefined) {
  if (!usage) return;
  console.log(
    `[claude] ${label} model=${model} input=${usage.input_tokens} ` +
      `cache_write=${usage.cache_creation_input_tokens ?? 0} ` +
      `cache_read=${usage.cache_read_input_tokens ?? 0} output=${usage.output_tokens}`,
  );
}

/**
 * messages.create sarmalayicisi: istenirse ust duzey cache_control ekler ve
 * her cagridan sonra token kullanimini loglar.
 *
 * Bir proxy (AI_INTEGRATIONS_ANTHROPIC_BASE_URL) ust duzey cache_control'u
 * tanimazsa 400 doner; bu durumda istek alan olmadan bir kez tekrarlanir,
 * sohbet bozulmaz.
 */
export async function createMessage(
  client: Anthropic,
  label: string,
  params: Anthropic.MessageCreateParamsNonStreaming,
  opts: CacheOptions = {},
): Promise<Anthropic.Message> {
  let response: Anthropic.Message;
  if (opts.auto) {
    try {
      response = await client.messages.create({ ...params, cache_control: EPHEMERAL });
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError && /cache_control/i.test(err.message)) {
        console.warn(`[claude] ${label}: top-level cache_control rejected, retrying without it`);
        response = await client.messages.create(params);
      } else {
        throw err;
      }
    }
  } else {
    response = await client.messages.create(params);
  }
  logUsage(label, params.model, response.usage);
  return response;
}
