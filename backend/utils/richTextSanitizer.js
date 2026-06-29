const sanitizeHtml = require('sanitize-html');

const sanitizeRichTextHtml = (html = '') => sanitizeHtml(String(html), {
    allowedTags: [
        'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'hr', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'table', 'tbody',
        'td', 'th', 'thead', 'tr', 'ul'
    ],
    allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        code: ['class'],
        h1: ['id'],
        h2: ['id'],
        h3: ['id'],
        h4: ['id'],
        h5: ['id'],
        h6: ['id'],
        img: ['alt', 'height', 'loading', 'decoding', 'src', 'title', 'width'],
        span: ['class'],
        td: ['align', 'colspan', 'rowspan'],
        th: ['align', 'colspan', 'rowspan']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
        img: ['http', 'https']
    },
    transformTags: {
        a: sanitizeHtml.simpleTransform('a', {
            rel: 'noopener noreferrer',
            target: '_blank'
        }),
        img: sanitizeHtml.simpleTransform('img', {
            loading: 'lazy',
            decoding: 'async'
        })
    }
});

module.exports = {
    sanitizeRichTextHtml,
};
