/**
 * DeskEmptyOverlay — 未设置工作台路径时的空状态提示
 */

import { useStore } from '../../stores';
import { openSettingsModal } from '../../stores/settings-modal-actions';
import { ICONS } from './desk-types';
import { EmptyState } from '../EmptyState';
import s from './Desk.module.css';

const t = (window.t ?? ((p: string) => p)) as (key: string) => string;

export function DeskEmptyOverlay() {
  const deskBasePath = useStore(s => s.deskBasePath);

  if (deskBasePath) return null;

  return (
    <EmptyState
      icon={<span dangerouslySetInnerHTML={{ __html: ICONS.folder }} />}
      title={t('desk.emptyTitle')}
      description={t('desk.emptyHint')}
      action={{ label: t('desk.goToSettings'), onClick: () => openSettingsModal('work') }}
      className={s.emptyOverlay}
    />
  );
}