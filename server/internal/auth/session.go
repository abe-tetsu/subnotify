package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	SessionCookieName = "subnotify_session"
	SessionDuration   = 30 * 24 * time.Hour
)

type Session struct {
	Token        string    `firestore:"token"`
	GoogleUserID string    `firestore:"googleUserId"`
	Email        string    `firestore:"email"`
	Name         string    `firestore:"name"`
	CreatedAt    time.Time `firestore:"createdAt"`
	ExpiresAt    time.Time `firestore:"expiresAt"`
}

type SessionStore struct {
	client *firestore.Client
}

func NewSessionStore(client *firestore.Client) *SessionStore {
	return &SessionStore{client: client}
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (s *SessionStore) Create(ctx context.Context, googleUserID, email, name string) (*Session, error) {
	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("セッショントークンの生成に失敗: %w", err)
	}

	now := time.Now().UTC()
	session := Session{
		Token:        token,
		GoogleUserID: googleUserID,
		Email:        email,
		Name:         name,
		CreatedAt:    now,
		ExpiresAt:    now.Add(SessionDuration),
	}

	_, err = s.client.Collection("sessions").Doc(token).Set(ctx, session)
	if err != nil {
		return nil, fmt.Errorf("セッションの保存に失敗: %w", err)
	}

	return &session, nil
}

func (s *SessionStore) Validate(ctx context.Context, token string) (*Session, error) {
	if token == "" {
		return nil, nil
	}

	doc, err := s.client.Collection("sessions").Doc(token).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("セッションの取得に失敗: %w", err)
	}

	var session Session
	if err := doc.DataTo(&session); err != nil {
		return nil, fmt.Errorf("セッションの解析に失敗: %w", err)
	}

	if time.Now().UTC().After(session.ExpiresAt) {
		_, _ = s.client.Collection("sessions").Doc(token).Delete(ctx)
		return nil, nil
	}

	return &session, nil
}

func (s *SessionStore) Delete(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	_, err := s.client.Collection("sessions").Doc(token).Delete(ctx)
	if err != nil && status.Code(err) != codes.NotFound {
		return fmt.Errorf("セッションの削除に失敗: %w", err)
	}
	return nil
}
