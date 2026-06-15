import { createI18n } from 'vue-i18n'
import messages from './index.js'

const savedLocale = localStorage.getItem('locale') || 'zh';

const i18n = createI18n({
    legacy: false,
    locale: savedLocale,
    fallbackLocale: 'en',
    messages,
})

export default i18n