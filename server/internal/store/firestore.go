package store

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type UserSettings struct {
	WorkspaceID              string    `firestore:"workspaceId"`
	ApiBaseUrl               string    `firestore:"apiBaseUrl"`
	OverlayBaseUrl           string    `firestore:"overlayBaseUrl"`
	NamedMessageTemplate     string    `firestore:"namedMessageTemplate"`
	AnonymousMessageTemplate string    `firestore:"anonymousMessageTemplate"`
	AccentColor              string    `firestore:"accentColor"`
	DisplayDurationSec       int       `firestore:"displayDurationSec"`
	PollingIntervalSec       int       `firestore:"pollingIntervalSec"`
	SoundPreset              string    `firestore:"soundPreset"`
	SoundVolume              float64   `firestore:"soundVolume"`
	AvatarDataURL            string    `firestore:"avatarDataUrl"`
	UpdatedAt                time.Time `firestore:"updatedAt"`
}

type SettingsStore struct {
	client *firestore.Client
}

func NewSettingsStore(client *firestore.Client) *SettingsStore {
	return &SettingsStore{client: client}
}

func (s *SettingsStore) Load(ctx context.Context, googleUserID string) (*UserSettings, error) {
	doc, err := s.client.Collection("users").Doc(googleUserID).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("ユーザー設定の取得に失敗: %w", err)
	}

	var settings UserSettings
	if err := doc.DataTo(&settings); err != nil {
		return nil, fmt.Errorf("ユーザー設定の解析に失敗: %w", err)
	}

	return &settings, nil
}

func (s *SettingsStore) Save(ctx context.Context, googleUserID string, settings UserSettings) error {
	settings.UpdatedAt = time.Now().UTC()

	_, err := s.client.Collection("users").Doc(googleUserID).Set(ctx, settings)
	if err != nil {
		return fmt.Errorf("ユーザー設定の保存に失敗: %w", err)
	}

	return nil
}
