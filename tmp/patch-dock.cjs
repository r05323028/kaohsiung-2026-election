const fs = require('fs');
const file = 'src/components/CityExplorer.tsx';
let s = fs.readFileSync(file, 'utf8');

const stateNeedle = "  const [settingsOpen, setSettingsOpen] = useState(false);";
if (!s.includes(stateNeedle)) throw new Error('state needle missing');
s = s.replace(stateNeedle, stateNeedle + "\n  const [dockPanel, setDockPanel] = useState<'districts' | 'people' | null>(null);");

s = s.replace("    setSelectedDistrictSlug(candidate.district.slug);\n    setSelectedCandidateSlug(slug);", "    setSelectedDistrictSlug(candidate.district.slug);\n    setSelectedCandidateSlug(slug);\n    setDockPanel(null);");

const escNeedle = "      if (selectedLandmark) setSelectedLandmark(null);";
if (!s.includes(escNeedle)) throw new Error('esc needle missing');
s = s.replace(escNeedle, "      if (dockPanel) {\n        setDockPanel(null);\n        return;\n      }\n      if (selectedLandmark) setSelectedLandmark(null);");
s = s.replace("  }, [query, selectedCandidateSlug, selectedLandmark, settingsOpen]);", "  }, [dockPanel, query, selectedCandidateSlug, selectedLandmark, settingsOpen]);");

const start = s.indexOf('        <div className="city-dock">');
const endMarker = '        </div>\n      </div>\n\n      {selectedCandidate && (';
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('dock range missing: ' + start + '/' + end);
const dock = `        <div className="city-dock">
          <div className="city-dock__bar">
            <fieldset className="city-zones">
              <legend className="sr-only">城市視角</legend>
              {(Object.keys(ZONE_LABELS) as SceneZone[]).map((zone) => (
                <button
                  aria-pressed={activeZone === zone}
                  className={activeZone === zone ? 'is-active' : ''}
                  key={zone}
                  type="button"
                  onClick={() => changeZone(zone)}
                >
                  {ZONE_LABELS[zone]}
                </button>
              ))}
            </fieldset>

            <button
              aria-controls="city-district-tray"
              aria-expanded={dockPanel === 'districts'}
              className="city-dock__toggle"
              type="button"
              onClick={() =>
                setDockPanel((current) =>
                  current === 'districts' ? null : 'districts',
                )
              }
            >
              <span className="city-dock__toggle-kicker">選區</span>
              <strong>{selectedDistrict?.name ?? '選擇選舉區'}</strong>
            </button>

            <button
              aria-controls="city-people-tray"
              aria-expanded={dockPanel === 'people'}
              className="city-dock__toggle"
              type="button"
              onClick={() =>
                setDockPanel((current) =>
                  current === 'people' ? null : 'people',
                )
              }
            >
              <span className="city-dock__toggle-kicker">人物</span>
              <strong>{visibleCandidates.length} 位</strong>
            </button>
          </div>

          {dockPanel === 'districts' && (
            <section
              aria-label="選舉區與選舉類型"
              className="city-tray city-tray--districts"
              id="city-district-tray"
            >
              <div className="city-tray__head">
                <div
                  aria-label="選舉類型"
                  className="segmented-control city-tabs"
                  role="tablist"
                >
                  {[
                    ['all', '全部'],
                    ['mayoral', '市長選'],
                    ['city-council', '市議選'],
                    ['indigenous-council', '原住民族'],
                    ['demo', '示範資料'],
                  ].map(([value, label]) => (
                    <button
                      aria-selected={electionFilter === value}
                      key={value}
                      role="tab"
                      type="button"
                      onClick={() => {
                        setElectionFilter(value as typeof electionFilter);
                        setSelectedCandidateSlug(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  aria-label="關閉選區列表"
                  className="city-tray__close"
                  type="button"
                  onClick={() => setDockPanel(null)}
                >
                  ×
                </button>
              </div>
              <fieldset className="city-districts">
                <legend className="sr-only">選舉區</legend>
                {filteredDistricts.map((district) => (
                  <button
                    aria-current={
                      selectedDistrict?.slug === district.slug ? 'true' : undefined
                    }
                    className={'district-button city-district' + (selectedDistrict?.slug === district.slug ? ' is-active' : '')}
                    key={district.id}
                    type="button"
                    onClick={() => selectDistrict(district.slug)}
                  >
                    <strong>{district.name}</strong>
                    <small>
                      {district.districtLabel}・
                      {district.isDemo ? '示範' : '官方切片'}
                    </small>
                  </button>
                ))}
              </fieldset>
            </section>
          )}

          {dockPanel === 'people' && (
            <section
              aria-labelledby="accessible-candidates-heading"
              className="city-tray city-tray--people"
              id="city-people-tray"
            >
              <div className="city-tray__head city-candidates__head">
                <h3 id="accessible-candidates-heading">
                  不用 3D 也能選擇人物
                </h3>
                <span>{visibleCandidates.length} 位</span>
                <button
                  aria-label="關閉人物列表"
                  className="city-tray__close"
                  type="button"
                  onClick={() => setDockPanel(null)}
                >
                  ×
                </button>
              </div>
              <div className="accessible-candidates__list city-candidates__list">
                {visibleCandidates.map((candidate) => (
                  <CandidateButton
                    active={
                      candidate.candidacy.slug === selectedCandidateSlug
                    }
                    candidate={candidate}
                    key={candidate.candidacy.id}
                    onSelect={selectCandidate}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
`;
s = s.slice(0, start) + dock + s.slice(end + '        </div>\n'.length);
fs.writeFileSync(file, s);
console.log('dock rewritten');
