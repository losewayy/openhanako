import { useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { TabType } from '../../types';
import { useStore } from '../../stores';
import { ActivityPanel } from '../ActivityPanel';
import { AutomationPanel } from '../AutomationPanel';
import { BridgePanel } from '../BridgePanel';
import { PreviewPanel } from '../PreviewPanel';
import { PluginPageView } from '../plugin/PluginPageView';
import { ChannelMessages, ChannelMembers, ChannelInput, ChannelReadonly, ChannelAgentActivityPanel, ChannelAgentSettingsPanel } from '../ChannelsPanel';
import { ChannelHeader } from '../channels/ChannelHeader';
import { MainContent } from '../../MainContent';
import { ChatPage } from './ChatPage';
import { WorkspaceCompanionRail } from './WorkspaceCompanionRail';

const tr = (key: string, vars?: Record<string, string | number>) => window.t?.(key, vars) ?? key;

function ChannelInputArea() {
  const currentChannel = useStore(s => s.currentChannel);
  const isDM = useStore(s => s.channelIsDM);

  if (!currentChannel) return null;

  if (isDM) {
    return (
      <div className="channel-readonly-notice">
        <ChannelReadonly />
      </div>
    );
  }

  return (
    <div className="channel-input-area">
      <ChannelInput />
    </div>
  );
}

function ChannelInspectorShell({ children }: { children: ReactNode }) {
  return (
    <aside className="channel-inspector-rail" id="channelInspector" data-channel-inspector="">
      <div className="resize-handle resize-handle-left" id="channelInspectorResizeHandle"></div>
      {children}
    </aside>
  );
}

function ChannelInspectorPanel() {
  const channelInfoName = useStore(s => s.channelInfoName);
  const isDM = useStore(s => s.channelIsDM);
  const currentChannel = useStore(s => s.currentChannel);

  if (!currentChannel) return null;

  if (isDM) {
    return (
      <ChannelInspectorShell>
        <div className="channel-info-stack">
          <div className="jian-card">
            <div className="channel-info-section">
              <div className="channel-info-label">{tr('channel.dmLabel')}</div>
              <div className="channel-members-list">
                <ChannelMembers />
              </div>
            </div>
          </div>
          <ChannelAgentSettingsPanel />
          <ChannelAgentActivityPanel />
        </div>
      </ChannelInspectorShell>
    );
  }

  return (
    <ChannelInspectorShell>
      <div className="channel-info-stack">
        <div className="jian-card">
          <div className="channel-info-section">
            <div className="channel-info-label">{tr('channel.info')}</div>
            <div className="channel-info-name">{channelInfoName}</div>
          </div>
          <div className="channel-info-section">
            <div className="channel-info-label">{tr('channel.members')}</div>
            <div className="channel-members-list">
              <ChannelMembers />
            </div>
          </div>
        </div>
        <ChannelAgentSettingsPanel />
        <ChannelAgentActivityPanel />
      </div>
    </ChannelInspectorShell>
  );
}

function ChannelPage() {
  const currentChannel = useStore(s => s.currentChannel);

  return (
    <div className="channel-page">
      <div className="channel-view active">
        {currentChannel ? (
          <>
            <ChannelHeader />
            <div className="channel-messages">
              <ChannelMessages />
            </div>
            <ChannelInputArea />
          </>
        ) : (
          <div className="channel-select-empty">
            {tr('channel.selectHint')}
          </div>
        )}
      </div>
      <ChannelInspectorPanel />
    </div>
  );
}

function PluginPage({ pluginId }: { pluginId: string }) {
  return (
    <div className="plugin-page-shell">
      <PluginPageView pluginId={pluginId} />
    </div>
  );
}

export function AppPages() {
  const currentTab = useStore(s => s.currentTab);
  const isPluginTab = typeof currentTab === 'string' && currentTab.startsWith('plugin:');
  const prevTabRef = useRef<TabType>(currentTab);
  const chatRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prevTabRef.current === currentTab) return;
    const prevTab = prevTabRef.current;
    prevTabRef.current = currentTab;

    const TRANSITION = 200;
    const prevIsPlugin = typeof prevTab === 'string' && prevTab.startsWith('plugin:');
    const prevEl = prevTab === 'chat' ? chatRef.current
      : prevTab === 'channels' ? channelsRef.current
      : prevIsPlugin ? pluginRef.current : null;
    const nextEl = currentTab === 'chat' ? chatRef.current
      : currentTab === 'channels' ? channelsRef.current
      : isPluginTab ? pluginRef.current : null;

    if (prevEl) {
      prevEl.style.animation = `hana-page-out ${TRANSITION}ms cubic-bezier(0.2, 0, 0, 1) forwards`;
    }
    if (nextEl) {
      nextEl.style.animation = `hana-page-in ${TRANSITION}ms cubic-bezier(0.2, 0, 0, 1) forwards`;
      nextEl.style.pointerEvents = 'auto';
    }
    const t = setTimeout(() => {
      if (prevEl) { prevEl.style.animation = ''; prevEl.style.pointerEvents = 'none'; }
      if (nextEl) { nextEl.style.animation = ''; }
    }, TRANSITION);
    return () => clearTimeout(t);
  }, [currentTab, isPluginTab]);

  const showChat = currentTab === 'chat';
  const showChannels = currentTab === 'channels';
  const showPlugin = isPluginTab;

  return (
    <>
      <MainContent>
        <div
          ref={chatRef}
          className="tab-page-shell"
          style={{
            opacity: showChat ? 1 : 0,
            pointerEvents: showChat ? 'auto' : 'none',
            position: !showChat ? 'absolute' : undefined,
            inset: !showChat ? 0 : undefined,
            zIndex: !showChat ? -1 : undefined,
          }}
        >
          <ChatPage />
        </div>
        <div
          ref={channelsRef}
          className="tab-page-shell"
          style={{
            opacity: showChannels ? 1 : 0,
            pointerEvents: showChannels ? 'auto' : 'none',
            position: !showChannels ? 'absolute' : undefined,
            inset: !showChannels ? 0 : undefined,
            zIndex: !showChannels ? -1 : undefined,
          }}
        >
          <ChannelPage />
        </div>
        <div
          ref={pluginRef}
          className="tab-page-shell"
          style={{
            opacity: showPlugin ? 1 : 0,
            pointerEvents: showPlugin ? 'auto' : 'none',
            position: !showPlugin ? 'absolute' : undefined,
            inset: !showPlugin ? 0 : undefined,
            zIndex: !showPlugin ? -1 : undefined,
          }}
        >
          {isPluginTab && <PluginPage pluginId={currentTab.slice(7)} />}
        </div>
        <ActivityPanel />
        <AutomationPanel />
        <BridgePanel />
      </MainContent>

      {showChat && <PreviewPanel />}
      <WorkspaceCompanionRail />
    </>
  );
}
