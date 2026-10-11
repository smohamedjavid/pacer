/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/pacer.json`.
 */
export type Pacer = {
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
          "name": "sourceToken"
        },
        {
          "name": "mint",
          "relations": [
            "paceState"
          ]
        },
        {
          "name": "destinationToken"
        },
        {
          "name": "owner"
        },
        {
          "name": "extraAccountMetaList",
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
          "name": "paceState",
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
            "paceState"
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
      "name": "initializePace",
      "docs": [
        "Attach an issuance clock (and optional burst limit) to a freshly created DBC",
        "transfer-hook pool.",
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
          "name": "paceState",
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
          "name": "extraAccountMetaList",
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "paceParams"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "paceState",
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
      "name": "paceInitialized",
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
      "name": "pacedBuy",
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
      "name": "pacedSell",
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
      "name": "aheadOfClock",
      "msg": "Buy is ahead of the issuance clock — wait for more supply to be released"
    },
    {
      "code": 6001,
      "name": "exceedsMaxPerBuy",
      "msg": "Buy exceeds the maximum size per buy"
    },
    {
      "code": 6002,
      "name": "burstLimit",
      "msg": "Buy exceeds the burst limit — too much supply bought in a short window"
    },
    {
      "code": 6003,
      "name": "notTransferring",
      "msg": "Hook can only run inside a Token-2022 transfer"
    },
    {
      "code": 6004,
      "name": "invalidPool",
      "msg": "Pool is not a DBC transfer-hook pool for this mint"
    },
    {
      "code": 6005,
      "name": "notPoolCreator",
      "msg": "Signer is not the DBC pool creator"
    },
    {
      "code": 6006,
      "name": "mintNotPaced",
      "msg": "Mint's transfer hook is not Pacer"
    },
    {
      "code": 6007,
      "name": "invalidParams",
      "msg": "Opening tranche or release rate must be non-zero"
    },
    {
      "code": 6008,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "paceInitialized",
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
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "openingTranche",
            "type": "u64"
          },
          {
            "name": "releasePerSecond",
            "type": "u64"
          },
          {
            "name": "maxPerBuy",
            "type": "u64"
          },
          {
            "name": "burstCapacity",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "paceParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "openingTranche",
            "docs": [
              "Base units released the moment the pool opens."
            ],
            "type": "u64"
          },
          {
            "name": "releasePerSecond",
            "docs": [
              "Base units released per second after that."
            ],
            "type": "u64"
          },
          {
            "name": "maxPerBuy",
            "docs": [
              "Largest single buy in base units (0 = no limit)."
            ],
            "type": "u64"
          },
          {
            "name": "burstCapacity",
            "docs": [
              "Most that can be bought in a burst, refilled at `release_per_second` (0 = no limit)."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "paceState",
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
            "name": "baseVault",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "openingTranche",
            "type": "u64"
          },
          {
            "name": "releasePerSecond",
            "type": "u64"
          },
          {
            "name": "maxPerBuy",
            "type": "u64"
          },
          {
            "name": "burstCapacity",
            "docs": [
              "Token-bucket burst limit: capacity, current level and last refill time."
            ],
            "type": "u64"
          },
          {
            "name": "burstLevel",
            "type": "u64"
          },
          {
            "name": "burstUpdatedTs",
            "type": "i64"
          },
          {
            "name": "initialBaseReserve",
            "docs": [
              "DBC `base_reserve` when the clock started; `net_out` is measured against it."
            ],
            "type": "u64"
          },
          {
            "name": "netOut",
            "docs": [
              "Net base units that have left the curve (bought minus sold), per DBC's reserves."
            ],
            "type": "u64"
          },
          {
            "name": "totalBought",
            "type": "u64"
          },
          {
            "name": "totalSold",
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
      "name": "pacedBuy",
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
            "name": "netOut",
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
      "name": "pacedSell",
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
            "name": "netOut",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
