"""Pydantic schema for circuits sent from the client.

Mirrors `client/src/editor/types.ts`. Field names are camelCase on the wire to
match the client; we keep them camelCase here too so the JSON contract is
identity-mapped.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class PlacedGate(BaseModel):
    id: str
    gateId: str
    column: int
    controls: list[int] = Field(default_factory=list)
    targets: list[int] = Field(default_factory=list)
    clbits: list[int] = Field(default_factory=list)
    params: list[str] = Field(default_factory=list)
    condition: dict | None = None


class Circuit(BaseModel):
    numQubits: int
    numClbits: int = 0
    gates: list[PlacedGate] = Field(default_factory=list)
