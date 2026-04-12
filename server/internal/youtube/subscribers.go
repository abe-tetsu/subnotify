package youtube

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
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

type channelStatisticsResponse struct {
	Items []struct {
		Statistics struct {
			SubscriberCount string `json:"subscriberCount"`
		} `json:"statistics"`
	} `json:"items"`
}

func (s *OAuthService) FetchSubscriberCount(ctx context.Context) (int, error) {
	client, err := s.httpClient(ctx)
	if err != nil {
		return 0, err
	}

	resp, err := client.Get("https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true")
	if err != nil {
		return 0, fmt.Errorf("登録者数の取得に失敗: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("登録者数の取得に失敗 (HTTP %d)", resp.StatusCode)
	}

	var result channelStatisticsResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("登録者数の解析に失敗: %w", err)
	}

	if len(result.Items) == 0 {
		return 0, fmt.Errorf("チャンネル情報が見つかりません")
	}

	count, err := strconv.Atoi(result.Items[0].Statistics.SubscriberCount)
	if err != nil {
		return 0, fmt.Errorf("登録者数の変換に失敗: %w", err)
	}

	return count, nil
}
