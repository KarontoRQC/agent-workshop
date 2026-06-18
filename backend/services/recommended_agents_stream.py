from services.coze_stream_transformer import content_event


AGENT_TAG = "AGENT"
FIELD_TAGS = {
    "RANK": "rank",
    "AGENT_NAME": "agent_name",
    "STAGE": "stage",
    "REASON": "reason",
}


class RecommendedAgentsStreamEmitter:
    def __init__(self):
        self.buffer = ""
        self.in_agent = False
        self.current_field_tag = None
        self.current_field_name = None
        self.current_agent = None
        self.current_agent_index = -1
        self.agents = []

    def feed(self, content):
        self.buffer += content
        yield from self._drain(final=False)

    def flush(self):
        yield from self._drain(final=True)

        if self.in_agent:
            yield from self._finish_agent()

        yield content_event(
            "recommended_agents.completed",
            {
                "type": "RECOMMENDED_AGENTS",
                "content_type": "json",
                "agents": self.agents,
            },
        )

    def _drain(self, final):
        while self.buffer:
            if self.current_field_tag:
                yield from self._drain_field(final)
                return

            if not self.in_agent:
                if not self._consume_until_agent_start(final):
                    return
                yield content_event(
                    "recommended_agent.started",
                    {
                        "type": "RECOMMENDED_AGENTS",
                        "content_type": "json",
                        "agent_index": self.current_agent_index,
                    },
                )
                continue

            next_tag = self._find_next_agent_inner_tag()

            if next_tag is None:
                self._keep_possible_tag(final, ["</AGENT>", *self._open_field_tags()])
                return

            index, tag, field_name = next_tag
            self.buffer = self.buffer[index:]

            if tag == "</AGENT>":
                self.buffer = self.buffer[len(tag) :]
                yield from self._finish_agent()
                continue

            self.current_field_tag = tag.strip("<>")
            self.current_field_name = field_name
            self.buffer = self.buffer[len(tag) :]

    def _drain_field(self, final):
        close_tag = f"</{self.current_field_tag}>"
        close_index = self.buffer.find(close_tag)

        if close_index >= 0:
            content = self.buffer[:close_index]
            yield from self._emit_field_delta(content.rstrip())
            self.buffer = self.buffer[close_index + len(close_tag) :]
            yield self._field_completed_event()
            self.current_field_tag = None
            self.current_field_name = None
            yield from self._drain(final=False)
            return

        if final:
            yield from self._emit_field_delta(self.buffer.rstrip())
            self.buffer = ""
            yield self._field_completed_event()
            self.current_field_tag = None
            self.current_field_name = None
            return

        keep_length = _longest_suffix_that_starts_tag(self.buffer, [close_tag])
        content = self.buffer[:-keep_length] if keep_length else self.buffer
        yield from self._emit_field_delta(content)
        self.buffer = self.buffer[-keep_length:] if keep_length else ""

    def _consume_until_agent_start(self, final):
        open_tag = "<AGENT>"
        start_index = self.buffer.find(open_tag)

        if start_index < 0:
            self._keep_possible_tag(final, [open_tag])
            return False

        self.buffer = self.buffer[start_index + len(open_tag) :]
        self.in_agent = True
        self.current_agent_index += 1
        self.current_agent = {"agent_index": self.current_agent_index}
        return True

    def _find_next_agent_inner_tag(self):
        tags = [("</AGENT>", None)]
        tags.extend((f"<{tag}>", field_name) for tag, field_name in FIELD_TAGS.items())
        matches = []

        for tag, field_name in tags:
            index = self.buffer.find(tag)

            if index >= 0:
                matches.append((index, tag, field_name))

        return min(matches, default=None, key=lambda match: match[0])

    def _open_field_tags(self):
        return [f"<{tag}>" for tag in FIELD_TAGS]

    def _keep_possible_tag(self, final, tags):
        if final:
            self.buffer = ""
            return

        keep_length = _longest_suffix_that_starts_tag(self.buffer, tags)
        self.buffer = self.buffer[-keep_length:] if keep_length else ""

    def _emit_field_delta(self, content):
        cleaned_content = _strip_nested_tags(content)

        if not cleaned_content:
            return

        field_name = self.current_field_name
        current_value = self.current_agent.get(field_name, "")
        next_value = f"{current_value}{cleaned_content}"
        self.current_agent[field_name] = _normalize_field_value(field_name, next_value)

        yield content_event(
            "recommended_agents.delta",
            {
                "type": "RECOMMENDED_AGENTS",
                "content_type": "json",
                "agent": dict(self.current_agent),
                "delta": {
                    "agent_index": self.current_agent_index,
                    "field": field_name,
                    "content": cleaned_content,
                },
            },
        )

    def _field_completed_event(self):
        return content_event(
            "recommended_agent.field.completed",
            {
                "type": "RECOMMENDED_AGENTS",
                "content_type": "json",
                "agent_index": self.current_agent_index,
                "field": self.current_field_name,
                "agent": dict(self.current_agent),
            },
        )

    def _finish_agent(self):
        if self.current_agent:
            agent = dict(self.current_agent)
            self.agents.append(agent)
            yield content_event(
                "recommended_agent.completed",
                {
                    "type": "RECOMMENDED_AGENTS",
                    "content_type": "json",
                    "agent": agent,
                },
            )

        self.in_agent = False
        self.current_agent = None
        self.current_field_tag = None
        self.current_field_name = None


def _normalize_field_value(field_name, value):
    value = str(value or "").strip() if field_name != "reason" else str(value or "")

    if field_name != "rank":
        return value

    try:
        return int(value)
    except ValueError:
        return value


def _strip_nested_tags(value):
    output = []
    in_tag = False

    for char in value:
        if char == "<":
            in_tag = True
            continue
        if char == ">":
            in_tag = False
            continue
        if not in_tag:
            output.append(char)

    return "".join(output)


def _longest_suffix_that_starts_tag(value, tags):
    max_length = 0

    for tag in tags:
        limit = min(len(value), len(tag) - 1)

        for length in range(1, limit + 1):
            if tag.startswith(value[-length:]):
                max_length = max(max_length, length)

    return max_length
