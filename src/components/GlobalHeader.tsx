import type { MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CandidateSearchRecord } from '../data';
import { SITE_NAV_LINKS } from '../data/site-nav';
import { withBase } from '../utils/paths';

type Props = {
  currentPath: string;
  immersive: boolean;
  searchIndex: CandidateSearchRecord[];
};

function currentState(currentPath: string, href: string) {
  if (href === '/') return currentPath === '/' ? 'page' : undefined;
  if (currentPath === href) return 'page';
  if (href === '/districts/' && currentPath.startsWith('/candidates/')) {
    return 'location';
  }
  return currentPath.startsWith(href) ? 'location' : undefined;
}

export default function GlobalHeader({
  currentPath,
  immersive,
  searchIndex,
}: Props) {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const explorer = immersive && currentPath === '/';
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = useMemo(
    () =>
      normalizedQuery
        ? searchIndex.filter((record) =>
            record.searchText.includes(normalizedQuery),
          )
        : [],
    [normalizedQuery, searchIndex],
  );

  useEffect(() => {
    const header = headerRef.current;
    if (header) header.dataset.hydrated = 'true';
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      headerRef.current
        ?.querySelector<HTMLAnchorElement>('#global-mobile-nav a')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (menuOpen) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      } else if (normalizedQuery) {
        setQuery('');
        searchInputRef.current?.focus();
      } else if (settingsOpen) {
        setSettingsOpen(false);
        window.dispatchEvent(
          new CustomEvent('kaohsiung:settings-open-change', { detail: false }),
        );
      }
    };
    const onSettingsClosed = () => setSettingsOpen(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('kaohsiung:settings-closed', onSettingsClosed);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('kaohsiung:settings-closed', onSettingsClosed);
    };
  }, [menuOpen, normalizedQuery, settingsOpen]);

  const handleCandidateClick = (
    event: MouseEvent<HTMLAnchorElement>,
    slug: string,
  ) => {
    if (
      !explorer ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const explorerRoot = document.querySelector(
      '[data-testid="city-explorer"]',
    );
    if (explorerRoot?.getAttribute('data-hydrated') !== 'true') return;

    event.preventDefault();
    window.dispatchEvent(
      new CustomEvent('kaohsiung:select-candidate', { detail: slug }),
    );
    setQuery('');
    searchInputRef.current?.focus();
  };

  const toggleSettings = () => {
    const nextOpen = !settingsOpen;
    setSettingsOpen(nextOpen);
    window.dispatchEvent(
      new CustomEvent('kaohsiung:settings-open-change', { detail: nextOpen }),
    );
  };

  return (
    <header
      className="global-header"
      data-testid="global-header"
      ref={headerRef}
    >
      <div className="global-header__surface">
        <a
          aria-label="港都人物誌首頁"
          className="brand-lockup global-header__brand"
          href={withBase('/')}
        >
          <span className="brand-lockup__mark">
            <img alt="" src={withBase('/harbor-mark.svg')} />
          </span>
          <span className="brand-lockup__copy">
            <span className="brand-lockup__title">港都人物誌</span>
            <span className="brand-lockup__subtitle">
              KAOHSIUNG CIVIC STORIES
            </span>
          </span>
        </a>

        <nav aria-label="主要網站導覽" className="global-header__nav">
          {SITE_NAV_LINKS.map((link) => (
            <a
              aria-current={currentState(currentPath, link.href)}
              href={withBase(link.href)}
              key={link.href}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="global-header__actions">
          <search aria-label="人物搜尋" className="global-header__search">
            <span aria-hidden="true" className="global-header__search-icon">
              ⌕
            </span>
            <label className="sr-only" htmlFor="candidate-search">
              搜尋人物
            </label>
            <input
              autoComplete="off"
              id="candidate-search"
              placeholder="搜尋人物"
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-controls={
                normalizedQuery ? 'candidate-search-results' : undefined
              }
            />
            {query && (
              <button
                aria-label="清除搜尋"
                className="global-header__search-clear"
                type="button"
                onClick={() => {
                  setQuery('');
                  searchInputRef.current?.focus();
                }}
              >
                ×
              </button>
            )}
            {normalizedQuery && (
              <div
                aria-live="polite"
                className="global-header__search-results"
                id="candidate-search-results"
              >
                <span className="global-header__search-count" role="status">
                  {matches.length} 位人物
                </span>
                {matches.length ? (
                  matches.slice(0, 8).map((candidate) => (
                    <a
                      className="city-candidate city-candidate--result"
                      href={withBase(`/candidates/${candidate.slug}/`)}
                      key={candidate.id}
                      onClick={(event) =>
                        handleCandidateClick(event, candidate.slug)
                      }
                    >
                      <span className="candidate-list__copy">
                        <span className="candidate-list__name">
                          <strong>{candidate.name}</strong>
                          {candidate.ballotNumber && (
                            <span className="candidate-list__ballot">
                              {candidate.ballotNumber}
                            </span>
                          )}
                        </span>
                        <small>{candidate.district}</small>
                      </span>
                    </a>
                  ))
                ) : (
                  <span className="global-header__search-empty">
                    找不到符合的人物
                  </span>
                )}
              </div>
            )}
          </search>

          <span className="global-header__settings-slot">
            {immersive ? (
              <button
                aria-controls="city-settings-panel"
                aria-expanded={settingsOpen}
                aria-label="顯示與體驗設定"
                className={`global-header__settings-button${settingsOpen ? ' is-active' : ''}`}
                onClick={toggleSettings}
                type="button"
              >
                <span aria-hidden="true">⚙</span>
              </button>
            ) : (
              <span
                aria-hidden="true"
                className="global-header__settings-placeholder"
              />
            )}
          </span>

          <button
            aria-controls="global-mobile-nav"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? '關閉網站選單' : '開啟網站選單'}
            className="global-header__menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            ref={menuButtonRef}
            type="button"
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="global-header__mobile-menu" id="global-mobile-nav">
          <div className="global-header__mobile-menu-head">
            <strong>網站導覽</strong>
            <button
              aria-label="關閉網站選單"
              onClick={() => {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
              }}
              type="button"
            >
              ×
            </button>
          </div>
          <nav aria-label="網站頁面">
            {SITE_NAV_LINKS.map((link) => (
              <a
                aria-current={currentState(currentPath, link.href)}
                href={withBase(link.href)}
                key={link.href}
                onClick={() => setMenuOpen(false)}
              >
                <span>{link.label}</span>
                <small>{link.english}</small>
              </a>
            ))}
          </nav>
          <p>以官方資料為基礎的沉浸式城市探索。人物移動為虛構模擬。</p>
        </div>
      )}
    </header>
  );
}
