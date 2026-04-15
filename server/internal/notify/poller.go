package notify

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/youtube"
)

type Poller struct {
	mu         sync.Mutex
	workspaces map[string]context.CancelFunc
}

func NewPoller() *Poller {
	return &Poller{
		workspaces: make(map[string]context.CancelFunc),
	}
}

func (p *Poller) IsRunning(workspace string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	_, ok := p.workspaces[workspace]
	return ok
}

func (p *Poller) Stop(workspace string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if cancel, ok := p.workspaces[workspace]; ok {
		cancel()
		delete(p.workspaces, workspace)
	}
}

func (p *Poller) Start(
	workspace string,
	oauth youtube.OAuthProvider,
	store *Store,
	broker *Broker,
	intervalSec int,
) {
	p.mu.Lock()
	if _, ok := p.workspaces[workspace]; ok {
		p.mu.Unlock()
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	p.workspaces[workspace] = cancel
	p.mu.Unlock()

	go p.pollLoop(ctx, workspace, oauth, store, broker, intervalSec)
}

func (p *Poller) pollLoop(
	ctx context.Context,
	workspace string,
	oauth youtube.OAuthProvider,
	store *Store,
	broker *Broker,
	intervalSec int,
) {
	log.Printf("[poller:%s] ポーリング開始 (間隔: %ds)", workspace, intervalSec)

	defer func() {
		p.mu.Lock()
		delete(p.workspaces, workspace)
		p.mu.Unlock()
		log.Printf("[poller:%s] ポーリング終了", workspace)
	}()

	initialized := false
	seen := store.LoadSeenSubscribers()
	stats := store.LoadStats()
	if len(seen) > 0 {
		initialized = true
		log.Printf("[poller:%s] 既知の登録者 %d 人をファイルから復元 (前回の総登録者数: %d)", workspace, len(seen), stats.LastTotalCount)
	}

	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !oauth.HasToken() {
				log.Printf("[poller:%s] トークン未保存。OAuth 完了を待機中。", workspace)
				continue
			}

			totalCount, err := oauth.FetchSubscriberCount(ctx)
			if err != nil {
				log.Printf("[poller:%s] 登録者数取得エラー: %v", workspace, err)
				continue
			}

			subscribers, err := oauth.FetchMySubscribers(ctx)
			if err != nil {
				log.Printf("[poller:%s] 登録者一覧取得エラー: %v", workspace, err)
				continue
			}

			if !initialized {
				for _, sub := range subscribers {
					seen[sub.ChannelID] = true
				}
				initialized = true
				stats.LastTotalCount = totalCount
				stats.LastUpdated = time.Now().UTC().Format(time.RFC3339)
				_ = store.SaveSeenSubscribers(seen)
				_ = store.SaveStats(stats)
				log.Printf("[poller:%s] 初回取得完了。公開登録者 %d 人、総登録者数 %d 人を記録。", workspace, len(seen), totalCount)
				continue
			}

			newPublicSubs := DetectNewSubscribers(subscribers, seen)
			for _, sub := range newPublicSubs {
				seen[sub.ChannelID] = true
				log.Printf("[poller:%s] 新規公開登録者を検出: %s", workspace, sub.Title)
				broker.Publish(workspace, NewSubscriberEvent(sub))
			}

			totalIncrease := totalCount - stats.LastTotalCount
			publicIncrease := len(newPublicSubs)
			anonymousCount := totalIncrease - publicIncrease
			if anonymousCount < 0 {
				anonymousCount = 0
			}

			if anonymousCount > 0 {
				log.Printf("[poller:%s] 匿名登録者 %d 人を検出", workspace, anonymousCount)
				for i := 0; i < anonymousCount; i++ {
					broker.Publish(workspace, NewAnonymousSubscriberEvent())
				}
			}

			stats.LastTotalCount = totalCount
			stats.LastUpdated = time.Now().UTC().Format(time.RFC3339)
			_ = store.SaveSeenSubscribers(seen)
			_ = store.SaveStats(stats)

			if len(newPublicSubs) > 0 || anonymousCount > 0 {
				log.Printf("[poller:%s] 通知送出完了 (公開: %d, 匿名: %d)", workspace, len(newPublicSubs), anonymousCount)
			}
		}
	}
}
