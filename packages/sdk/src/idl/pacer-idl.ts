// Generated from target/idl/pacer.json by `pnpm sync-idl`. Do not edit.
import type { Pacer } from './pacer.js'

export const PACER_IDL_JSON = {
  "address": "4AX6qNnFYqLqKLvcSe6FkvCJWJsoBF9pK743UmEYLokM",
  "metadata": {
    "name": "pacer",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "execute",
      "docs": [
        "Token-2022 transfer hook entrypoint."
      ],
      "discriminator": [
        105,
        37,
        101,
        197,
        75,
        251,
        102,
        26
      ],
      "accounts": [
        {
          "name": "source_token"
        },
        {
          "name": "mint",
          "relations": [
            "pace_state"
          ]
        },
        {
          "name": "destination_token"
        },
        {
          "name": "owner"
        },
        {
          "name": "extra_account_meta_list",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "pace_state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "pool",
          "relations": [
            "pace_state"
          ]
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize_pace",
      "docs": [
        "Attach an issuance clock to a freshly created DBC transfer-hook pool.",
        "Must be signed by the pool creator; usually sent in the same transaction as",
        "`initialize_virtual_pool_with_token2022_transfer_hook`."
      ],
      "discriminator": [
        179,
        242,
        216,
        95,
        46,
        150,
        175,
        113
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "pool"
        },
        {
          "name": "pace_state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "extra_account_meta_list",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "PaceParams"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "PaceState",
      "discriminator": [
        24,
        70,
        200,
        240,
        239,
        87,
        109,
        220
      ]
    }
  ],
  "events": [
    {
      "name": "PaceInitialized",
      "discriminator": [
        104,
        41,
        49,
        120,
        33,
        25,
        63,
        223
      ]
    },
    {
      "name": "PacedBuy",
      "discriminator": [
        246,
        40,
        79,
        166,
        109,
        5,
        16,
        231
      ]
    },
    {
      "name": "PacedSell",
      "discriminator": [
        135,
        140,
        138,
        30,
        162,
        83,
        67,
        157
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "AheadOfClock",
      "msg": "Buy is ahead of the issuance clock — wait for more supply to be released"
    },
    {
      "code": 6001,
      "name": "ExceedsMaxPerBuy",
      "msg": "Buy exceeds the maximum size per buy"
    },
    {
      "code": 6002,
      "name": "NotTransferring",
      "msg": "Hook can only run inside a Token-2022 transfer"
    },
    {
      "code": 6003,
      "name": "InvalidPool",
      "msg": "Pool is not a DBC transfer-hook pool for this mint"
    },
    {
      "code": 6004,
      "name": "NotPoolCreator",
      "msg": "Signer is not the DBC pool creator"
    },
    {
      "code": 6005,
      "name": "MintNotPaced",
      "msg": "Mint's transfer hook is not Pacer"
    },
    {
      "code": 6006,
      "name": "InvalidParams",
      "msg": "Opening tranche or release rate must be non-zero"
    },
    {
      "code": 6007,
      "name": "MathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "PaceInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "start_ts",
            "type": "i64"
          },
          {
            "name": "opening_tranche",
            "type": "u64"
          },
          {
            "name": "release_per_second",
            "type": "u64"
          },
          {
            "name": "max_per_buy",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "PaceParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "opening_tranche",
            "docs": [
              "Base units released the moment the pool opens."
            ],
            "type": "u64"
          },
          {
            "name": "release_per_second",
            "docs": [
              "Base units released per second after that."
            ],
            "type": "u64"
          },
          {
            "name": "max_per_buy",
            "docs": [
              "Largest single buy in base units (0 = no limit)."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "PaceState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "base_vault",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "start_ts",
            "type": "i64"
          },
          {
            "name": "opening_tranche",
            "type": "u64"
          },
          {
            "name": "release_per_second",
            "type": "u64"
          },
          {
            "name": "max_per_buy",
            "type": "u64"
          },
          {
            "name": "initial_base_reserve",
            "docs": [
              "DBC `base_reserve` when the clock started; `net_out` is measured against it."
            ],
            "type": "u64"
          },
          {
            "name": "net_out",
            "docs": [
              "Net base units that have left the curve (bought minus sold), per DBC's reserves."
            ],
            "type": "u64"
          },
          {
            "name": "total_bought",
            "type": "u64"
          },
          {
            "name": "total_sold",
            "type": "u64"
          },
          {
            "name": "buys",
            "type": "u32"
          },
          {
            "name": "sells",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "PacedBuy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "net_out",
            "type": "u64"
          },
          {
            "name": "released",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "PacedSell",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "net_out",
            "type": "u64"
          }
        ]
      }
    }
  ]
} as const

export const PACER_IDL = PACER_IDL_JSON as unknown as Pacer
