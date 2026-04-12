package youtube

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type Subscriber struct {
	ChannelID string
	Title     string
}

type subscriberListResponse struct {
	Items []struct {
		SubscriberSnippet struct {
			ChannelID string `json:"channelId"`
			Title     string `json:"title"`
		} `json:"subscriberSnippet"`
	} `json:"items"`
}

func (s *OAuthService) FetchMySubscribers(ctx context.Context) ([]Subscriber, error) {
	client, err := s.httpClient(ctx)
	if err != nil {
		return nil, err
	}

	resp, err := client.Get("https://www.googleapis.com/youtube/v3/subscriptions?part=subscriberSnippet&mySubscribers=true&maxResults=50")
	if err != nil {
		return nil, fmt.Errorf("登録者一覧の取得に失敗: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("登録者一覧の取得に失敗 (HTTP %d)", resp.StatusCode)
	}

	var result subscriberListResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("登録者一覧の解析に失敗: %w", err)
	}

	subscribers := make([]Subscriber, 0, len(result.Items))
	for _, item := range result.Items {
		subscribers = append(subscribers, Subscriber{
			ChannelID: item.SubscriberSnippet.ChannelID,
			Title:     item.SubscriberSnippet.Title,
		})
	}

	return subscribers, nil
}
