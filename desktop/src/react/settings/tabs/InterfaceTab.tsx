import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../store';
import { t, VALID_THEMES, autoSaveConfig } from '../helpers';
import { SelectWidget } from '@/ui';
import { Toggle } from '../widgets/Toggle';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { NumberInput } from '../components/NumberInput';
import {
  applyEditorTypography,
  mergeEditorTypography,
  normalizeEditorTypography,
  type EditorMarkdownTypography,
  applyChatTypography,
  mergeChatTypography,
  normalizeChatTypography,
  type ChatTypography,
} from '../../editor/typography';
import {
  isPaperTextureBlockedTheme,
} from '../../../shared/appearance-preferences';
import styles from '../Settings.module.css';
import registry from '../../../shared/theme-registry';

const platform = window.platform;
const i18n = window.i18n;

const THEME_NAME_KEYS: Record<string, string> = Object.fromEntries([
  ...Object.entries(registry.THEMES).map(([id, t]: [string, any]) => [id, t.i18nName]),
  [registry.AUTO_OPTION.id, registry.AUTO_OPTION.i18nName],
]);

const THEME_MODE_KEYS: Record<string, string> = Object.fromEntries([
  ...Object.entries(registry.THEMES).map(([id, t]: [string, any]) => [id, t.i18nMode]),
  [registry.AUTO_OPTION.id, registry.AUTO_OPTION.i18nMode],
]);

const THEME_DESC_KEYS: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(registry.THEMES).map(([id, t]: [string, any]) => [id, t.i18nDescription]),
);

function getGroupedThemes(): Array<{ groupKey: string; themeIds: string[] }> {
  const functional: string[] = [];
  const personalized: string[] = [];

  if (VALID_THEMES.includes('auto')) functional.push('auto');

  for (const id of VALID_THEMES) {
    if (id === 'auto') continue;
    const entry = registry.THEMES[id as keyof typeof registry.THEMES];
    if (entry?.group === 'functional') functional.push(id);
    else personalized.push(id);
  }

  const groups: Array<{ groupKey: string; themeIds: string[] }> = [];
  if (functional.length) groups.push({ groupKey: 'settings.appearance.groupFunctional', themeIds: functional });
  if (personalized.length) groups.push({ groupKey: 'settings.appearance.groupPersonalized', themeIds: personalized });
  return groups;
}

type MarkdownTypographyKey = keyof EditorMarkdownTypography;

const EDITOR_FONT_SIZE_ROWS: Array<{
  key: MarkdownTypographyKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}> = [
  { key: 'bodyFontSize', label: 'settings.editor.markdownBodyFontSize', hint: 'settings.editor.markdownBodyFontSizeHint', min: 12, max: 24 },
  { key: 'heading1FontSize', label: 'settings.editor.markdownHeading1FontSize', hint: 'settings.editor.markdownHeading1FontSizeHint', min: 16, max: 40 },
  { key: 'heading2FontSize', label: 'settings.editor.markdownHeading2FontSize', hint: 'settings.editor.markdownHeading2FontSizeHint', min: 15, max: 34 },
  { key: 'heading3FontSize', label: 'settings.editor.markdownHeading3FontSize', hint: 'settings.editor.markdownHeading3FontSizeHint', min: 14, max: 30 },
  { key: 'heading4FontSize', label: 'settings.editor.markdownHeading4FontSize', hint: 'settings.editor.markdownHeading4FontSizeHint', min: 13, max: 28 },
  { key: 'heading5FontSize', label: 'settings.editor.markdownHeading5FontSize', hint: 'settings.editor.markdownHeading5FontSizeHint', min: 12, max: 26 },
  { key: 'heading6FontSize', label: 'settings.editor.markdownHeading6FontSize', hint: 'settings.editor.markdownHeading6FontSizeHint', min: 12, max: 24 },
];

export function InterfaceTab() {
  const { settingsConfig, currentTheme, serifEnabled, paperTextureEnabled, leavesOverlayEnabled } = useSettingsStore(
    useShallow(s => ({
      settingsConfig: s.settingsConfig,
      currentTheme: s.currentTheme,
      serifEnabled: s.serifEnabled,
      paperTextureEnabled: s.paperTextureEnabled,
      leavesOverlayEnabled: s.leavesOverlayEnabled,
    }))
  );
  const paperTextureBlocked = isPaperTextureBlockedTheme(document.documentElement.getAttribute('data-theme'));
  const editorTypography = useMemo(
    () => normalizeEditorTypography(settingsConfig?.editor),
    [settingsConfig?.editor],
  );
  const chatTypography = useMemo(
    () => normalizeChatTypography(settingsConfig),
    [settingsConfig],
  );

  const saveEditorTypography = async (patch: Partial<EditorMarkdownTypography>) => {
    const previousConfig = useSettingsStore.getState().settingsConfig || {};
    const previousEditor = previousConfig.editor;
    const next = mergeEditorTypography(previousEditor, { markdown: patch });
    useSettingsStore.setState({ settingsConfig: { ...previousConfig, editor: next } });
    applyEditorTypography(next);
    platform?.settingsChanged?.('editor-typography-changed', { editor: next });

    const saved = await autoSaveConfig({ editor: next }, { silent: true });
    if (saved) {
      useSettingsStore.getState().showToast(t('settings.autoSaved'), 'success');
      return;
    }

    const restored = normalizeEditorTypography(previousEditor);
    useSettingsStore.setState({ settingsConfig: previousConfig });
    applyEditorTypography(restored);
    platform?.settingsChanged?.('editor-typography-changed', { editor: restored });
  };

  const saveChatTypography = async (patch: Partial<ChatTypography>) => {
    const previousConfig = useSettingsStore.getState().settingsConfig || {};
    const next = mergeChatTypography(previousConfig, { chat: patch });
    const nextConfig = { ...previousConfig, chat: next.chat };
    useSettingsStore.setState({ settingsConfig: nextConfig });
    applyChatTypography(next);
    platform?.settingsChanged?.('chat-typography-changed', { chat: next.chat });

    const saved = await autoSaveConfig({ chat: next.chat }, { silent: true });
    if (saved) {
      useSettingsStore.getState().showToast(t('settings.autoSaved'), 'success');
      return;
    }

    const restored = normalizeChatTypography(previousConfig);
    useSettingsStore.setState({ settingsConfig: previousConfig });
    applyChatTypography(restored);
    platform?.settingsChanged?.('chat-typography-changed', { chat: restored.chat });
  };

  const locale = settingsConfig?.locale || 'zh-CN';
  const localeVal = ['zh-CN', 'zh-TW', 'ja', 'ko', 'en'].includes(locale) ? locale
    : locale.startsWith('zh') ? 'zh-CN'
    : locale.startsWith('ja') ? 'ja'
    : locale.startsWith('ko') ? 'ko'
    : 'en';

  // 时区
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const commonTz = [
    'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore',
    'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Kolkata',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'Pacific/Auckland', 'Australia/Sydney',
  ];
  const tzSet = new Set(commonTz);
  if (browserTz && !tzSet.has(browserTz)) commonTz.unshift(browserTz);
  const currentTz = settingsConfig?.timezone || browserTz || 'Asia/Shanghai';
  if (!tzSet.has(currentTz) && currentTz !== browserTz) commonTz.unshift(currentTz);
  const tzOptions = commonTz.map(tz => {
    try {
      const offset = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
        .formatToParts(new Date()).find((p: any) => p.type === 'timeZoneName')?.value || '';
      return { value: tz, label: `${tz.replace(/_/g, ' ')}  (${offset})` };
    } catch { return { value: tz, label: tz.replace(/_/g, ' ') }; }
  });

  return (
    <div className={`${styles['settings-tab-content']} ${styles['active']}`} data-tab="interface">
      <SettingsSection title={t('settings.appearance.theme')} variant="flush">
        {getGroupedThemes().map(({ groupKey, themeIds }) => (
          <div key={groupKey} className={styles['themeGroup']}>
            <div className={styles['themeGroupTitle']}>{t(groupKey)}</div>
            <div className={styles['theme-options']}>
              {themeIds.map(theme => (
                <button
                  key={theme}
                  className={`${styles['theme-card']}${currentTheme === theme ? ' ' + styles['active'] : ''}`}
                  data-theme={theme}
                  onClick={() => {
                    setTheme?.(theme);
                    localStorage.setItem(registry.STORAGE_KEY, theme);
                    platform?.settingsChanged?.('theme-changed', { theme });
                    useSettingsStore.setState({ currentTheme: theme });
                  }}
                >
                  <div className={styles['theme-card-name']}>{t(THEME_NAME_KEYS[theme])}</div>
                  <div className={styles['theme-card-mode']}>{t(THEME_MODE_KEYS[theme])}</div>
                  {THEME_DESC_KEYS[theme] && (
                    <div className={styles['theme-card-description']}>{t(THEME_DESC_KEYS[theme]!)}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </SettingsSection>

      <SettingsSection title={t('settings.appearance.title')}>
        <SettingsRow
          label={t('settings.appearance.serifFont')}
          hint={t('settings.appearance.serifFontHint')}
          control={
            <Toggle
              on={serifEnabled}
              onChange={(next) => {
                setSerifFont?.(next);
                platform?.settingsChanged?.('font-changed', { serif: next });
                useSettingsStore.setState({ serifEnabled: next });
              }}
            />
          }
        />
        <SettingsRow
          label={t('settings.appearance.paperTexture')}
          hint={paperTextureBlocked
            ? t('settings.appearance.paperTextureDarkDisabledHint')
            : t('settings.appearance.paperTextureHint')}
          control={
            <Toggle
              on={paperTextureBlocked ? false : paperTextureEnabled}
              disabled={paperTextureBlocked}
              onChange={(next) => {
                window.setPaperTexture?.(next);
                platform?.settingsChanged?.('paper-texture-changed', { enabled: next });
                useSettingsStore.setState({ paperTextureEnabled: next });
              }}
            />
          }
        />
        <SettingsRow
          label={t('settings.appearance.leavesOverlay')}
          hint={t('settings.appearance.leavesOverlayHint')}
          control={
            <Toggle
              on={leavesOverlayEnabled}
              onChange={(next) => {
                localStorage.setItem('hana-leaves-overlay', next ? '1' : '0');
                window.dispatchEvent(new CustomEvent('hana-settings', {
                  detail: { type: 'leaves-overlay-changed', enabled: next },
                }));
                platform?.settingsChanged?.('leaves-overlay-changed', { enabled: next });
                useSettingsStore.setState({ leavesOverlayEnabled: next });
              }}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t('settings.editor.title')}>
        {EDITOR_FONT_SIZE_ROWS.map(row => (
          <SettingsRow
            key={row.key}
            label={t(row.label)}
            hint={t(row.hint)}
            control={
              <NumberInput
                value={editorTypography.markdown[row.key]}
                onChange={(value) => saveEditorTypography({ [row.key]: value })}
                unit="px"
                min={row.min}
                max={row.max}
              />
            }
          />
        ))}
        <SettingsRow
          label={t('settings.editor.markdownLineHeight')}
          hint={t('settings.editor.markdownLineHeightHint')}
          control={
            <NumberInput
              value={editorTypography.markdown.lineHeight}
              onChange={(value) => saveEditorTypography({ lineHeight: value })}
              min={1.2}
              max={2.2}
              step={0.05}
              precision="float"
            />
          }
        />
        <SettingsRow
          label={t('settings.editor.markdownContentPadding')}
          hint={t('settings.editor.markdownContentPaddingHint')}
          control={
            <NumberInput
              value={editorTypography.markdown.contentPadding}
              onChange={(value) => saveEditorTypography({ contentPadding: value })}
              unit="px"
              min={0}
              max={64}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t('settings.chat.title')}>
        <SettingsRow
          label={t('settings.chat.chatMaxWidth')}
          hint={t('settings.chat.chatMaxWidthHint')}
          control={
            <NumberInput
              value={chatTypography.chat.chatMaxWidth}
              onChange={(value) => saveChatTypography({ chatMaxWidth: value })}
              unit="px"
              min={400}
              max={1200}
            />
          }
        />
        <SettingsRow
          label={t('settings.chat.chatFontSize')}
          hint={t('settings.chat.chatFontSizeHint')}
          control={
            <NumberInput
              value={chatTypography.chat.chatFontSize}
              onChange={(value) => saveChatTypography({ chatFontSize: value })}
              unit="rem"
              min={0.75}
              max={1.3}
              step={0.05}
              precision="float"
            />
          }
        />
        <SettingsRow
          label={t('settings.chat.chatLineHeight')}
          hint={t('settings.chat.chatLineHeightHint')}
          control={
            <NumberInput
              value={chatTypography.chat.chatLineHeight}
              onChange={(value) => saveChatTypography({ chatLineHeight: value })}
              min={1.2}
              max={2.2}
              step={0.05}
              precision="float"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title={t('settings.locale.title')}>
        <SettingsRow
          label={t('settings.locale.language')}
          hint={t('settings.locale.languageHint')}
          control={
            <SelectWidget
              options={[
                { value: 'zh-CN', label: '简体中文' },
                { value: 'zh-TW', label: '繁體中文' },
                { value: 'ja', label: '日本語' },
                { value: 'ko', label: '한국어' },
                { value: 'en', label: 'English' },
              ]}
              value={localeVal}
              onChange={async (val) => {
                await autoSaveConfig({ locale: val }, { silent: true });
                await i18n?.load(val);
                if (i18n) i18n.defaultName = useSettingsStore.getState().agentName;
                useSettingsStore.getState().showToast(t('settings.autoSaved'), 'success');
                useSettingsStore.setState({});
              }}
            />
          }
        />
        <SettingsRow
          label={t('settings.locale.timezone')}
          hint={t('settings.locale.timezoneHint')}
          control={
            <SelectWidget
              options={tzOptions}
              value={currentTz}
              onChange={(val) => autoSaveConfig({ timezone: val })}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
