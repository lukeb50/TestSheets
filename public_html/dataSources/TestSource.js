/* global google, fetch */

class TestSource extends Source {

    JsonResults = {
        "responses": [
            {
                "responseId": "ACYDBNj6Itvd524IzI5_P2omsmRz62OxhnIZhGHPBKAySt_dZise6gpF905fSf8Qzw1BSCs",
                "createTime": "2025-02-19T21:10:33.106Z",
                "lastSubmittedTime": "2025-02-19T21:10:33.106049Z",
                "answers": {
                    "379a9e02": {
                        "questionId": "379a9e02",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "Jane Doe"
                                }
                            ]
                        }
                    },
                    "6dce7eca": {
                        "questionId": "6dce7eca",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "Barrie"
                                }
                            ]
                        }
                    },
                    "365b72aa": {
                        "questionId": "365b72aa",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "123 Fake St"
                                }
                            ]
                        }
                    },
                    "0d94cf9f": {
                        "questionId": "0d94cf9f",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "1990-02-20"
                                }
                            ]
                        }
                    },
                    "0f43d875": {
                        "questionId": "0f43d875",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "7051111111"
                                }
                            ]
                        }
                    },
                    "58404121": {
                        "questionId": "58404121",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "B2B 2B2"
                                }
                            ]
                        }
                    }
                }
            },
            {
                "responseId": "ACYDBNiF00-_7-jP7VC_MsjevyXiSEVYKCT7pkRpI7KVVqqwdGQzEedjDzDFwsdY8HHjQbE",
                "createTime": "2025-02-19T03:35:45.535Z",
                "lastSubmittedTime": "2025-02-19T03:35:45.535847Z",
                "answers": {
                    "379a9e02": {
                        "questionId": "379a9e02",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "John Doe"
                                }
                            ]
                        }
                    },
                    "6dce7eca": {
                        "questionId": "6dce7eca",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "Toronto"
                                }
                            ]
                        }
                    },
                    "365b72aa": {
                        "questionId": "365b72aa",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "123 Main St"
                                }
                            ]
                        }
                    },
                    "0d94cf9f": {
                        "questionId": "0d94cf9f",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "2010-10-10"
                                }
                            ]
                        }
                    },
                    "0f43d875": {
                        "questionId": "0f43d875",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "111-111-1111"
                                }
                            ]
                        }
                    },
                    "17154799": {
                        "questionId": "17154799",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "fake@fake.com"
                                }
                            ]
                        }
                    },
                    "58404121": {
                        "questionId": "58404121",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "A1A-1A1"
                                }
                            ]
                        }
                    }
                }
            },
            {
                "responseId": "ACYDBNhZ-kOgSF4v-5wKxtUKRxehq6QRvIx2K3kbloYDNTDv5tcSGxctPb5hAML0JYmOPoI",
                "createTime": "2025-02-18T00:21:36.773Z",
                "lastSubmittedTime": "2025-02-18T00:21:36.773655Z",
                "answers": {
                    "379a9e02": {
                        "questionId": "379a9e02",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "John Smith IV"
                                }
                            ]
                        }
                    },
                    "6dce7eca": {
                        "questionId": "6dce7eca",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "Barrie"
                                }
                            ]
                        }
                    },
                    "365b72aa": {
                        "questionId": "365b72aa",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "123 Barrie View Dr"
                                }
                            ]
                        }
                    },
                    "0d94cf9f": {
                        "questionId": "0d94cf9f",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "2012-11-13"
                                }
                            ]
                        }
                    },
                    "0f43d875": {
                        "questionId": "0f43d875",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "705-987-6543"
                                }
                            ]
                        }
                    },
                    "17154799": {
                        "questionId": "17154799",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "johnthefourth@smith.com"
                                }
                            ]
                        }
                    },
                    "58404121": {
                        "questionId": "58404121",
                        "textAnswers": {
                            "answers": [
                                {
                                    "value": "J4J5y1"
                                }
                            ]
                        }
                    }
                }
            }
        ]
    }

    init() {
        return new Promise((resolve) => {
            resolve();
        });
    }

    promptUser(formId) {
        return new Promise((resolve, reject) => {
            resolve();
        });
    }

    //Convert JSON into a ResponseContainer & Return
    getResponseContainer() {
        let container = new ResponseContainer(this.sheetInformation, this.fieldData);
        this.JsonResults['responses'].forEach((entry) => {
            let timestamp = new Date(entry['lastSubmittedTime']).getTime();
            let responseObj = new Response(timestamp);
            let answerListing = entry['answers'];
            for (const[key, answer] of Object.entries(answerListing)) {
                responseObj.addAnswer(new Answer(answer['textAnswers']['answers'][0]['value'], answer['questionId']));
            }
            container.addResponse(responseObj);
        });
        return container;
    }
};