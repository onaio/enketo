import { describe, expect, it } from 'vitest';
import { transform } from './shared';

const LANGUAGES = ['English', 'French'];

/**
 * A form whose every label renders Markdown, so each one takes the
 * placeholder path in `renderMarkdown`.
 */
const buildMarkdownForm = (questionCount: number) => {
    const paths = Array.from(
        { length: questionCount },
        (_, index) => `/data/q${index}`
    );
    const translations = LANGUAGES.map(
        (lang) =>
            `<translation lang="${lang}">${paths
                .map(
                    (path) =>
                        `<text id="${path}:label"><value>**${lang}** label for ${path}</value></text>`
                )
                .join('')}</translation>`
    ).join('');

    return `<?xml version="1.0"?>
<h:html xmlns="http://www.w3.org/2002/xforms" xmlns:h="http://www.w3.org/1999/xhtml" xmlns:jr="http://openrosa.org/javarosa">
<h:head><h:title>markdown form</h:title><model>
<itext>${translations}</itext>
<instance><data id="markdown_form">${paths
        .map((path) => `<${path.split('/').pop()}/>`)
        .join('')}<meta><instanceID/></meta></data></instance>
${paths.map((path) => `<bind nodeset="${path}" type="string"/>`).join('')}
</model></h:head>
<h:body>${paths
        .map(
            (path) =>
                `<input ref="${path}"><label ref="jr:itext('${path}:label')"/></input>`
        )
        .join('')}</h:body>
</h:html>`;
};

const timeTransform = async (xform: string) => {
    const startedAt = performance.now();

    await transform({ xform });

    return performance.now() - startedAt;
};

const fastestOf = async (runs: number, xform: string) => {
    const timings: number[] = [];

    for (let run = 0; run < runs; run += 1) {
        // Overlapping runs would distort each other's timings.
        // eslint-disable-next-line no-await-in-loop
        timings.push(await timeTransform(xform));
    }

    return Math.min(...timings);
};

describe('large forms', () => {
    it('scales linearly with the number of Markdown labels', async () => {
        const small = buildMarkdownForm(500);
        const large = buildMarkdownForm(2000);

        await timeTransform(small);

        const smallMs = await fastestOf(3, small);
        const largeMs = await fastestOf(3, large);

        // 4x the labels costs ~4x when linear; the quadratic placeholder
        // substitution this guards against pushed it past 10x.
        expect(largeMs / smallMs).toBeLessThan(7);
    }, 120_000);
});
