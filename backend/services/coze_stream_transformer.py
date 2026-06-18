import json


ROUTE_PLANNER_TAGS = {
    "ACK": ("<ACK>", "</ACK>"),
    "KG_PATH": ("<KG_PATH>", "</KG_PATH>"),
    "EXPLANATION": ("<EXPLANATION>", "</EXPLANATION>"),
}

RECOMMENDER_TAGS = {
    "ACK": ("<ACK>", "</ACK>"),
    "RECOMMENDED_AGENTS": ("<RECOMMENDED_AGENTS>", "</RECOMMENDED_AGENTS>"),
    "SUMMARY": ("<SUMMARY>", "</SUMMARY>"),
}


class TaggedContentParser:
    def __init__(
        self,
        section_tags=None,
        section_emitters=None,
        section_stream_emitters=None,
        untagged_type=None,
    ):
        self.section_tags = section_tags or ROUTE_PLANNER_TAGS
        self.section_emitters = section_emitters or {}
        self.section_stream_emitters = section_stream_emitters or {}
        self.untagged_type = untagged_type
        self.buffer = ""
        self.current_type = None
        self.current_buffer = None
        self.current_stream_emitter = None
        self.at_section_start = False

    def feed(self, content):
        self.buffer += content
        yield from self._drain(final=False)

    def flush(self):
        yield from self._drain(final=True)

    def _drain(self, final):
        while self.buffer:
            if self.current_type is None:
                match = self._find_next_opening_tag()

                if match is None:
                    yield from self._keep_possible_opening_tag(final)
                    return

                tag_index, section_type, open_tag = match
                if tag_index > 0:
                    yield from self._untagged_delta(self.buffer[:tag_index])

                self.buffer = self.buffer[tag_index + len(open_tag) :]
                self.current_type = section_type
                self.current_buffer = "" if section_type in self.section_emitters else None
                stream_emitter = self.section_stream_emitters.get(section_type)
                self.current_stream_emitter = stream_emitter() if stream_emitter else None
                self.at_section_start = True
                yield content_event("content.started", {"type": section_type})
                continue

            close_tag = self.section_tags[self.current_type][1]
            close_index = self.buffer.find(close_tag)

            if close_index >= 0:
                content = self.buffer[:close_index].rstrip()
                yield from self._content_delta(content)
                yield from self._finish_current_section()
                self.buffer = self.buffer[close_index + len(close_tag) :]
                continue

            if final:
                yield from self._content_delta(self.buffer.rstrip())
                yield from self._finish_current_section()
                self.buffer = ""
                return

            keep_length = _longest_suffix_that_starts_tag(self.buffer, [close_tag])
            content = self.buffer[:-keep_length] if keep_length else self.buffer
            yield from self._content_delta(content)
            self.buffer = self.buffer[-keep_length:] if keep_length else ""
            return

    def _find_next_opening_tag(self):
        matches = []

        for section_type, (open_tag, _) in self.section_tags.items():
            tag_index = self.buffer.find(open_tag)
            if tag_index >= 0:
                matches.append((tag_index, section_type, open_tag))

        return min(matches, default=None, key=lambda match: match[0])

    def _keep_possible_opening_tag(self, final):
        if self.untagged_type:
            yield from self._emit_untagged_or_keep_possible_tag(final)
            return

        if final:
            self.buffer = ""
            return

        opening_tags = [open_tag for open_tag, _ in self.section_tags.values()]
        keep_length = _longest_suffix_that_starts_tag(self.buffer, opening_tags)
        self.buffer = self.buffer[-keep_length:] if keep_length else ""

    def _emit_untagged_or_keep_possible_tag(self, final):
        if final:
            content = self.buffer.rstrip()
            self.buffer = ""
            yield from self._untagged_delta(content)
            return

        opening_tags = [open_tag for open_tag, _ in self.section_tags.values()]
        keep_length = _longest_suffix_that_starts_tag(self.buffer, opening_tags)
        content = self.buffer[:-keep_length] if keep_length else self.buffer
        self.buffer = self.buffer[-keep_length:] if keep_length else ""
        yield from self._untagged_delta(content)

    def _untagged_delta(self, content):
        if not self.untagged_type or not content or not content.strip():
            return

        yield content_event(
            "content.delta",
            {
                "type": self.untagged_type,
                "content_type": "text",
                "content": content,
            },
        )

    def _content_delta(self, content):
        if self.at_section_start:
            content = content.lstrip()

        if not content:
            return

        self.at_section_start = False

        if self.current_buffer is not None:
            self.current_buffer += content
            return

        if self.current_stream_emitter is not None:
            yield from self.current_stream_emitter.feed(content)
            return

        yield content_event(
            "content.delta",
            {
                "type": self.current_type,
                "content_type": "text",
                "content": content,
            },
        )

    def _finish_current_section(self):
        if self.current_buffer is not None:
            emitter = self.section_emitters.get(self.current_type)

            if emitter:
                yield from emitter(self.current_buffer.strip())

        if self.current_stream_emitter is not None:
            yield from self.current_stream_emitter.flush()

        yield content_event("content.completed", {"type": self.current_type})
        self.current_type = None
        self.current_buffer = None
        self.current_stream_emitter = None
        self.at_section_start = False


def iter_tagged_events(
    upstream,
    section_tags=None,
    section_emitters=None,
    section_stream_emitters=None,
    untagged_type=None,
):
    parser = TaggedContentParser(
        section_tags=section_tags,
        section_emitters=section_emitters,
        section_stream_emitters=section_stream_emitters,
        untagged_type=untagged_type,
    )

    for event_name, data in iter_sse_frames(upstream):
        if data == "[DONE]":
            yield content_event("done", {})
            continue

        payload = parse_json_object(data)

        if event_name == "conversation.message.delta":
            content = payload.get("content")
            if isinstance(content, str):
                yield from parser.feed(content)
            continue

        if event_name == "conversation.message.completed":
            yield from parser.flush()
            yield content_event("message.completed", message_metadata(payload))
            continue

        if event_name == "conversation.chat.completed":
            yield from parser.flush()
            yield content_event("chat.completed", chat_metadata(payload))
            continue

        if event_name in {"conversation.chat.created", "conversation.chat.in_progress"}:
            yield content_event(short_event_name(event_name), chat_metadata(payload))
            continue

        if event_name:
            yield content_event(short_event_name(event_name), safe_metadata(payload))

    yield from parser.flush()


def iter_tagged_json_stream(upstream):
    for event in iter_tagged_events(upstream):
        yield format_sse_event(event)


def iter_sse_frames(upstream):
    event_name = None
    data_lines = []

    try:
        for raw_line in upstream.iter_lines(decode_unicode=False):
            line = raw_line.decode("utf-8", errors="replace")

            if not line:
                if event_name or data_lines:
                    yield event_name, "\n".join(data_lines)
                event_name = None
                data_lines = []
                continue

            if line.startswith("event:"):
                event_name = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data_lines.append(line.removeprefix("data:").lstrip())

        if event_name or data_lines:
            yield event_name, "\n".join(data_lines)
    finally:
        upstream.close()


def content_event(event_name, payload):
    return {
        "event": event_name,
        **payload,
    }


def format_sse_event(event):
    event_name = event.get("event", "message")
    return f"event: {event_name}\ndata: {json_dumps(event)}\n\n"


def parse_json_object(data):
    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return {}

    return payload if isinstance(payload, dict) else {}


def chat_metadata(payload):
    return pick_fields(
        payload,
        [
            "id",
            "conversation_id",
            "bot_id",
            "created_at",
            "status",
            "usage",
            "last_error",
        ],
    )


def message_metadata(payload):
    return pick_fields(
        payload,
        [
            "id",
            "conversation_id",
            "bot_id",
            "role",
            "type",
            "content_type",
            "chat_id",
            "section_id",
        ],
    )


def safe_metadata(payload):
    return {key: value for key, value in payload.items() if key != "content"}


def pick_fields(payload, fields):
    return {field: payload[field] for field in fields if field in payload}


def short_event_name(event_name):
    return event_name.removeprefix("conversation.")


def _longest_suffix_that_starts_tag(value, tags):
    max_length = 0

    for tag in tags:
        limit = min(len(value), len(tag) - 1)

        for length in range(1, limit + 1):
            if tag.startswith(value[-length:]):
                max_length = max(max_length, length)

    return max_length


def json_dumps(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))
