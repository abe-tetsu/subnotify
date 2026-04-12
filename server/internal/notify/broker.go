package notify

import (
	"sync"
)

type Broker struct {
	mu          sync.Mutex
	subscribers map[chan NotifyEvent]struct{}
	pending     []NotifyEvent
	nextSeq     uint64
}

func NewBroker() *Broker {
	return &Broker{
		subscribers: make(map[chan NotifyEvent]struct{}),
	}
}

func (b *Broker) Subscribe() chan NotifyEvent {
	ch := make(chan NotifyEvent, 100)
	b.mu.Lock()
	b.subscribers[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

func (b *Broker) Unsubscribe(ch chan NotifyEvent) {
	b.mu.Lock()
	delete(b.subscribers, ch)
	b.mu.Unlock()
	close(ch)
}

func (b *Broker) Publish(event NotifyEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.nextSeq++
	b.pending = append(b.pending, event)
	for ch := range b.subscribers {
		select {
		case ch <- event:
		default:
		}
	}
}

func (b *Broker) Poll(sinceSeq uint64) ([]NotifyEvent, uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if sinceSeq >= b.nextSeq {
		return nil, b.nextSeq
	}

	start := b.nextSeq - uint64(len(b.pending))
	if sinceSeq < start {
		sinceSeq = start
	}

	offset := sinceSeq - start
	result := make([]NotifyEvent, len(b.pending[offset:]))
	copy(result, b.pending[offset:])

	// keep only last 100
	if len(b.pending) > 100 {
		b.pending = b.pending[len(b.pending)-100:]
	}

	return result, b.nextSeq
}
