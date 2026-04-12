package notify

import (
	"sync"
)

type workspaceBroker struct {
	subscribers map[chan NotifyEvent]struct{}
	pending     []NotifyEvent
	nextSeq     uint64
}

type Broker struct {
	mu         sync.Mutex
	workspaces map[string]*workspaceBroker
}

func NewBroker() *Broker {
	return &Broker{
		workspaces: make(map[string]*workspaceBroker),
	}
}

func (b *Broker) getOrCreate(workspace string) *workspaceBroker {
	wb, ok := b.workspaces[workspace]
	if !ok {
		wb = &workspaceBroker{
			subscribers: make(map[chan NotifyEvent]struct{}),
		}
		b.workspaces[workspace] = wb
	}
	return wb
}

func (b *Broker) Subscribe(workspace string) chan NotifyEvent {
	ch := make(chan NotifyEvent, 100)
	b.mu.Lock()
	wb := b.getOrCreate(workspace)
	wb.subscribers[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

func (b *Broker) Unsubscribe(workspace string, ch chan NotifyEvent) {
	b.mu.Lock()
	if wb, ok := b.workspaces[workspace]; ok {
		delete(wb.subscribers, ch)
	}
	b.mu.Unlock()
	close(ch)
}

func (b *Broker) Publish(workspace string, event NotifyEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()

	wb := b.getOrCreate(workspace)
	wb.nextSeq++
	wb.pending = append(wb.pending, event)

	if len(wb.pending) > 100 {
		wb.pending = wb.pending[len(wb.pending)-100:]
	}

	for ch := range wb.subscribers {
		select {
		case ch <- event:
		default:
		}
	}
}

func (b *Broker) Poll(workspace string, sinceSeq uint64) ([]NotifyEvent, uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	wb, ok := b.workspaces[workspace]
	if !ok {
		return nil, 0
	}

	if sinceSeq >= wb.nextSeq {
		return nil, wb.nextSeq
	}

	start := wb.nextSeq - uint64(len(wb.pending))
	if sinceSeq < start {
		sinceSeq = start
	}

	offset := sinceSeq - start
	result := make([]NotifyEvent, len(wb.pending[offset:]))
	copy(result, wb.pending[offset:])

	return result, wb.nextSeq
}
