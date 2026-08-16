import * as Bob from "@bob-plug/core";
import { load, Cheerio, AnyNode } from 'cheerio';
import { Part, Phonetic } from './helper/types';

const baseUrl = 'https://dictionary.cambridge.org';
// 每个释义块最多收集的例句数
const MAX_EXAMPLES_PER_DEF = 2;

/**
 *
 * @param {object} query
 * @param {string} query.detectFrom = en; 一定不是 auto
 * @param {string} query.detectTo = "zh-Hans" 一定不是 auto
 * @param {string} query.from = auto 可能是 auto
 * @param {string} query.to = auto 可能是 auto
 * @param {string} query.text = "string"
 * @param {*} completion
 */
function translate(query, completion) {
    if (query.detectFrom !== 'en' || !query.text || query.text.split(" ").length > 3) {
        completion({
            error: {
                type: 'notFound',
            }
        });
        return;
    }
    let text = query.text.split(" ").join("-");
    Bob.api.$http.get({
        url: `https://dictionary.cambridge.org/zhs/%E8%AF%8D%E5%85%B8/%E8%8B%B1%E8%AF%AD-%E6%B1%89%E8%AF%AD-%E7%AE%80%E4%BD%93/${text}`,
        handler: (res) => {
            main(res.data, completion);
            if (res.error) {
                Bob.api.$log.error(`reserr: ${Object.keys(res)}`);
            }
        }
    });
}
const main = (file: any, completion) => {
    const $ = load(file);
    const word = $('.headword').first().text();
    const hasWord = $('.headword').html();
    Bob.api.$log.info(`word: ${word}`);
    if (!hasWord) {
        completion({
            error: {
                type: 'notFound',
            }
        });
        return;
    }
    const phonetics: Phonetic[] = [
        makePhonetic($('.us .pron .ipa'), $('.us [type="audio/mpeg"]'), 'us'),
        makePhonetic($('.uk .pron .ipa'), $('.uk [type="audio/mpeg"]'), 'uk')
    ];
    // 词性分组：每个词性一组，组内按释义块组织
    // 释义行：全局连续序号 + 英文释义 + 中文释义（无中文释义则省略，避免误取例句）
    // 例句行：最多 MAX_EXAMPLES_PER_DEF 条，英中同行
    const parts: Part[] = [];
    let senseNo = 0;
    $('.entry-body__el').each((_, el) => {
        // 词性：名词、形容词等，anc-info-head为短语的时候词性classname
        const partSpeech = ($('.posgram', el).text() || $('.anc-info-head', el).text()).trim();
        const means: string[] = [];
        $('.dsense', el).each((_, senseEl) => {
            $('.def-block', senseEl).each((_, blockEl) => {
                senseNo++;
                const enExplanation = $('.ddef_d', blockEl).text();
                const cnExplanation = $('.def-body .trans', blockEl).first().text();
                means.push(cnExplanation ? `${senseNo}. ${enExplanation}  ${cnExplanation}` : `${senseNo}. ${enExplanation}`);
                let exampleCnt = 0;
                $('.examp', blockEl).each((_, exEl) => {
                    if (exampleCnt >= MAX_EXAMPLES_PER_DEF) {
                        return;
                    }
                    const enExample = $('.eg', exEl).text();
                    const cnExample = $('.trans', exEl).first().text();
                    means.push(cnExample ? `• ${enExample}  ${cnExample}` : `• ${enExample}`);
                    exampleCnt++;
                });
            });
        });
        if (means.length) {
            parts.push({ part: partSpeech, means });
        }
    });
    const res = {
        from: 'en',
        to: 'zh-Hans',
        fromParagraphs: [
            word
        ],
        toDict: {
            phonetics,
            additions: [],
            parts,
            word: word
        },
        raw: '',
        toParagraphs: [ word ],
    }
    completion({
        result: res
    });
    Bob.api.$log.info(`res${JSON.stringify(res)}`);
}

const cache = new Bob.Cache();
const INSTALL = "__INSTALLED";

const makePhonetic = ($textEl: Cheerio<AnyNode>, $audioEl: Cheerio<AnyNode>, type: string): Phonetic => {
    const value = $textEl.first().text() ?? '';
    const audio = $audioEl.attr('src');
    return {
        type,
        value,
        tts: audio ? {
            type: 'url',
            value: `${baseUrl}${audio}`
        } : undefined
    }
}

const buryPoint = (eventName) => {
    Bob.api.$http
        .post<{ status: 1 | 0 }>({
            url: "https://api.mixpanel.com/track?verbose=1&%69%70=1",
            header: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: {
                data: JSON.stringify([
                    {
                        event: eventName,
                        properties: {
                            token: "756388d6385bd7d3b849b18e4016c84a",
                            identifier: Bob.api.$info.identifier,
                            version: Bob.api.$info.version,
                        },
                    },
                ]),
            },
        })
        .finally(() => {
            cache.set(INSTALL, Bob.api.$info.version);
        });
};
const otherLang: Array<[string, string]> = [
    "af",
    "ar",
    "az",
    "bg",
    "bn",
    "bs",
    "cs",
    "da",
    "de",
    "el",
    "en",
    "es",
    "et",
    "fa",
    "fi",
    "fr",
    "gu",
    "he",
    "hi",
    "hr",
    "id",
    "it",
    "ja",
    "ka",
    "km",
    "kn",
    "ko",
    "lo",
    "lt",
    "lv",
    "mk",
    "ml",
    "mn",
    "mr",
    "ms",
    "my",
    "nl",
    "no",
    "pa",
    "pl",
    "pt",
    "ro",
    "ru",
    "sk",
    "sl",
    "sv",
    "ta",
    "te",
    "th",
    "tl",
    "tr",
    "uk",
    "ur",
    "vi",
    "ab",
    "sq",
    "ay",
    "ba",
    "bi",
    "nb",
    "ca",
    "cv",
    "eo",
    "ee",
    "fj",
    "lg",
    "kl",
    "ht",
    "tn",
    "ho",
    "iu",
    "ki",
    "kg",
    "kj",
    "lu",
    "mh",
    "ng",
    "nd",
    "os",
    "qu",
    "sm",
    "sg",
    "st",
    "nr",
    "ss",
    "ty",
    "tt",
    "ti",
    "to",
    "ts",
    "tk",
    "tw",
].map((e) => [e, e]);

const items: Array<[string, string]> = [["zh-Hans", "zh"], ["zh-Hant", "zh-Hant"], ...otherLang];
const langMap = new Map(items);
function supportLanguages() {
    if (!cache.get(INSTALL)) {
        // 没有安装过
        buryPoint("plugin-installed");
    } else if (cache.get(INSTALL) !== Bob.api.$info.version) {
        // 更新版本或安装了最初版本，标识为 true
        buryPoint("plugin-updated");
    }
    return ['zh-Hans','en'];
}