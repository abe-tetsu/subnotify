package notify

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/youtube"
)

const (
	seenSubscribersFile  = "seen_subscribers.json"
	pendingEventsFile    = "pending_events.json"
	subscriberStatsFile  = "subscriber_stats.json"
)

type SubscriberStats struct {
	LastTotalCount int    `json:"lastTotalCount"`
	LastUpdated    string `json:"lastUpdated"`
}

type NotifyEvent struct {
	ID                    string `json:"id"`
	Kind                  string `json:"kind"`
	SubscriberName        string `json:"subscriberName"`
	SubscriberChannelID   string `json:"subscriberChannelId"`
	Message               string `json:"message"`
	AccentColor           string `json:"accentColor,omitempty"`
	DisplayDurationSec    int    `json:"displayDurationSec,omitempty"`
	AvatarUrl             string  `json:"avatarUrl,omitempty"`
	SoundPreset           string  `json:"soundPreset,omitempty"`
	SoundVolume           float64 `json:"soundVolume,omitempty"`
	CreatedAt             string  `json:"createdAt"`
}

type Store struct {
	dataDir string
	mu      sync.Mutex
}

func NewStore(dataDir string) *Store {
	return &Store{dataDir: dataDir}
}

func (s *Store) LoadSeenSubscribers() map[string]bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.dataDir, seenSubscribersFile)
	data, err := os.ReadFile(path)
	if err != nil {
		return make(map[string]bool)
	}

	var ids []string
	if err := json.Unmarshal(data, &ids); err != nil {
		return make(map[string]bool)
	}

	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		seen[id] = true
	}
	return seen
}

func (s *Store) SaveSeenSubscribers(seen map[string]bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	ids := make([]string, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}

	data, err := json.MarshalIndent(ids, "", "  ")
	if err != nil {
		return fmt.Errorf("既知登録者の保存に失敗: %w", err)
	}

	path := filepath.Join(s.dataDir, seenSubscribersFile)
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return fmt.Errorf("既知登録者ファイルの書き込みに失敗: %w", err)
	}
	return os.Rename(tmpPath, path)
}

func DetectNewSubscribers(current []youtube.Subscriber, seen map[string]bool) []youtube.Subscriber {
	var newSubs []youtube.Subscriber
	for _, sub := range current {
		if !seen[sub.ChannelID] {
			newSubs = append(newSubs, sub)
		}
	}
	return newSubs
}

func (s *Store) AppendEvents(events []NotifyEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing := s.loadPendingEventsLocked()
	existing = append(existing, events...)

	data, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return fmt.Errorf("イベントの保存に失敗: %w", err)
	}

	path := filepath.Join(s.dataDir, pendingEventsFile)
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return fmt.Errorf("イベントファイルの書き込みに失敗: %w", err)
	}
	return os.Rename(tmpPath, path)
}

func (s *Store) LoadPendingEvents() []NotifyEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadPendingEventsLocked()
}

func (s *Store) ClearEvents() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.dataDir, pendingEventsFile)
	if err := os.WriteFile(path, []byte("[]"), 0600); err != nil {
		return fmt.Errorf("イベントファイルのクリアに失敗: %w", err)
	}
	return nil
}

func (s *Store) loadPendingEventsLocked() []NotifyEvent {
	path := filepath.Join(s.dataDir, pendingEventsFile)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var events []NotifyEvent
	if err := json.Unmarshal(data, &events); err != nil {
		return nil
	}
	return events
}

func (s *Store) LoadStats() SubscriberStats {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.dataDir, subscriberStatsFile)
	data, err := os.ReadFile(path)
	if err != nil {
		return SubscriberStats{}
	}

	var stats SubscriberStats
	if err := json.Unmarshal(data, &stats); err != nil {
		return SubscriberStats{}
	}
	return stats
}

func (s *Store) SaveStats(stats SubscriberStats) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(stats, "", "  ")
	if err != nil {
		return fmt.Errorf("stats の保存に失敗: %w", err)
	}

	path := filepath.Join(s.dataDir, subscriberStatsFile)
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return fmt.Errorf("stats ファイルの書き込みに失敗: %w", err)
	}
	return os.Rename(tmpPath, path)
}

func NewEventID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func NewSubscriberEvent(sub youtube.Subscriber) NotifyEvent {
	return NotifyEvent{
		ID:                  NewEventID(),
		Kind:                "new_subscriber",
		SubscriberName:      sub.Title,
		SubscriberChannelID: sub.ChannelID,
		CreatedAt:           time.Now().UTC().Format(time.RFC3339),
	}
}

func NewAnonymousSubscriberEvent() NotifyEvent {
	return NotifyEvent{
		ID:                  NewEventID(),
		Kind:                "new_anonymous_subscriber",
		SubscriberName:      "",
		SubscriberChannelID: "",
		CreatedAt:           time.Now().UTC().Format(time.RFC3339),
	}
}
