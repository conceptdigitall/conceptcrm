'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { MarketingPost, MarketingProject, MarketingSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/lib/marketing/content';
import { MarketingTabsHeader, type MarketingSubtab } from '@/components/marketing/marketing-tabs-header';
import { FeedTab } from '@/components/marketing/feed-tab';
import { StoriesTab } from '@/components/marketing/stories-tab';
import { ProjectsTab } from '@/components/marketing/projects-tab';
import { LibraryTab } from '@/components/marketing/library-tab';
import { SettingsTab } from '@/components/marketing/settings-tab';
import { CreatePostModal } from '@/components/marketing/create-post-modal';
import { VideoGenerator } from '@/components/marketing/video-generator';

export function MarketingSubtabsPage() {
  const [currentTab, setCurrentTab] = useState<MarketingSubtab>('feed');
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [projects, setProjects] = useState<MarketingProject[]>([]);
  const [settings, setSettings] = useState<MarketingSettings>({
    account_id: '',
    ...DEFAULT_SETTINGS,
  });
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalKind, setCreateModalKind] = useState<'feed' | 'story'>('feed');
  const [librarySelectedPostId, setLibrarySelectedPostId] = useState<string>('');
  // Prompt vindo de Projetos ou do modal; a key força o gerador a recomeçar com ele.
  const [videoSeed, setVideoSeed] = useState<{ prompt: string; target: 'reels' | 'story'; key: number }>({ prompt: '', target: 'reels', key: 0 });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [postsRes, projectsRes, settingsRes] = await Promise.all([
        fetch('/api/marketing/posts'),
        fetch('/api/marketing/projects'),
        fetch('/api/marketing/settings'),
      ]);

      if (postsRes.ok) {
        const postsData = await postsRes.json();
        setPosts(postsData.posts || []);
      }
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects || []);
      }
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.settings) {
          setSettings(settingsData.settings);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados de marketing:', err);
      toast.error('Não foi possível carregar os dados de marketing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtra posts por feed vs story
  const feedPosts = posts.filter((p) => p.kind === 'feed');
  const storyPosts = posts.filter((p) => p.kind === 'story');
  const pendingCount = posts.filter((p) => p.status === 'pending_approval').length;

  function handlePostUpdated(updated: MarketingPost) {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function handlePostCreated(newPost: MarketingPost) {
    setPosts((prev) => [newPost, ...prev]);
  }

  function handleNavigateToLibrary(post: MarketingPost) {
    setLibrarySelectedPostId(post.id);
    setCurrentTab('library');
  }

  function openVideoGenerator(prompt: string, target: 'reels' | 'story' = 'reels') {
    setVideoSeed((prev) => ({ prompt, target, key: prev.key + 1 }));
    setCurrentTab('videos');
  }

  function handleGenerateFromProject(prompt: string, _project: MarketingProject) {
    openVideoGenerator(prompt);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm font-medium">Carregando Aba Marketing IA...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-28 md:p-6 lg:pb-6 max-w-7xl mx-auto w-full text-foreground">
      {/* Cabeçalho Global e Abas */}
      <MarketingTabsHeader
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        pendingCount={pendingCount}
        instagramUsername={settings.instagram_username || 'conceptdigita.l'}
        onFilterPending={() => setCurrentTab('feed')}
      />

      {/* Conteúdo Dinâmico por Subaba */}
      <main className="w-full">
        {currentTab === 'feed' && (
          <FeedTab
            posts={feedPosts}
            onOpenCreate={() => {
              setCreateModalKind('feed');
              setCreateModalOpen(true);
            }}
            onPostUpdated={handlePostUpdated}
            onNavigateToLibrary={handleNavigateToLibrary}
          />
        )}

        {currentTab === 'stories' && (
          <StoriesTab
            stories={storyPosts}
            onOpenCreateStory={() => {
              setCreateModalKind('story');
              setCreateModalOpen(true);
            }}
            onStoryUpdated={handlePostUpdated}
          />
        )}

        {currentTab === 'videos' && (
          <VideoGenerator key={videoSeed.key} initialPrompt={videoSeed.prompt} initialTarget={videoSeed.target} embedded />
        )}

        {currentTab === 'projects' && (
          <ProjectsTab
            projects={projects}
            onGenerateFromProject={handleGenerateFromProject}
          />
        )}

        {currentTab === 'library' && (
          <LibraryTab
            posts={posts}
            onPostCreated={handlePostCreated}
            selectedPostId={librarySelectedPostId}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onSettingsSaved={setSettings}
          />
        )}
      </main>

      {/* Modal de Criação de Post / Story */}
      <CreatePostModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        settings={settings}
        onCreated={handlePostCreated}
        defaultKind={createModalKind}
        onPickVideo={() => {
          setCreateModalOpen(false);
          openVideoGenerator('', createModalKind === 'story' ? 'story' : 'reels');
        }}
      />
    </div>
  );
}
