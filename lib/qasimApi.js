import axios from 'axios';

const unavailable = (name) => async () => {
    throw new Error(`${name} service is unavailable in this deployment`);
};

function stylize(text, transform) {
    return [...text].map((char) => transform(char)).join('');
}

const fonts = [
    (char) => char,
    (char) => char.toUpperCase(),
    (char) => char === ' ' ? ' ' : `【${char}】`,
    (char) => char === ' ' ? ' ' : `『${char}』`
];

export const qasimApi = {
    apksearch: unavailable('APK search'),
    trendtwit: unavailable('trends'),
    wattpad: unavailable('Wattpad'),
    async npmStalk(name) {
        const response = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { timeout: 15000 });
        return { result: response.data };
    },
    async styletext(text) {
        return fonts.map((transform) => ({ result: stylize(text, transform) }));
    }
};
