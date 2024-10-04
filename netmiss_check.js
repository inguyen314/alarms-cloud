document.addEventListener('DOMContentLoaded', async function () {
    // Display the loading indicator
    const loadingIndicator = document.getElementById('loading_alarm_netmiss_check');
    loadingIndicator.style.display = 'block';

    let category = "Netmiss-Comparison";

    const apiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/location/group?office=${office}&include-assigned=false&location-category-like=${category}`;
    // console.log("apiUrl: ", apiUrl);

    const netmissTsidMap = new Map();
    const metadataMap = new Map();

    const metadataPromises = [];
    const netmissTsidPromises = [];

    // Get current date and time
    const currentDateTime = new Date();
    // console.log('currentDateTime:', currentDateTime);

    // Subtract thirty hours from current date and time
    const currentDateTimeMinus30Hours = subtractHoursFromDate(currentDateTime, 23);
    // console.log('currentDateTimeMinus30Hours :', currentDateTimeMinus30Hours);

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (!Array.isArray(data) || data.length === 0) {
                console.warn('No data available from the initial fetch.');
                return;
            }

            const targetCategory = { "office-id": office, "id": "Netmiss-Comparison" };
            const filteredArray = filterByLocationCategory(data, targetCategory);
            const basins = filteredArray.map(item => item.id);
            if (basins.length === 0) {
                console.warn('No basins found for the given category.');
                return;
            }

            const apiPromises = [];
            const combinedData = [];

            basins.forEach(basin => {
                const basinApiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/location/group/${basin}?office=${office}&category-id=${category}`;

                apiPromises.push(
                    fetch(basinApiUrl)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Network response was not ok for basin ${basin}: ${response.statusText}`);
                            }
                            return response.json();
                        })
                        .then(firstData => {
                            console.log('firstData:', firstData);

                            if (!firstData) {
                                console.log(`No data for basin: ${basin}`);
                                return;
                            }

                            firstData[`assigned-locations`] = firstData[`assigned-locations`].filter(location => location.attribute <= 900);
                            firstData[`assigned-locations`].sort((a, b) => a.attribute - b.attribute);
                            combinedData.push(firstData);

                            if (firstData['assigned-locations']) {
                                firstData['assigned-locations'].forEach(loc => {

                                    let netmissTsidApiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries/group/Netmiss-Comparison?office=${office}&category-id=${loc['location-id']}`;
                                    if (netmissTsidApiUrl) {
                                        netmissTsidPromises.push(
                                            fetch(netmissTsidApiUrl)
                                                .then(response => {
                                                    if (response.status === 404) {
                                                        return null; // Skip processing if no data is found
                                                    }
                                                    if (!response.ok) {
                                                        throw new Error(`Network response was not ok: ${response.statusText}`);
                                                    }
                                                    return response.json();
                                                })
                                                .then(netmissTsidData => {
                                                    console.log('netmissTsidData:', netmissTsidData);

                                                    // Extract the dynamic part from time-series-category
                                                    let dynamicId = netmissTsidData['time-series-category']['id'];

                                                    // Create the new timeseries-id dynamically
                                                    let newTimeseriesId = `${dynamicId}.Stage.Inst.~1Day.0.netmiss-fcst`;

                                                    // New object to append
                                                    let newAssignedTimeSeries = {
                                                        "office-id": "MVS",
                                                        "timeseries-id": newTimeseriesId, // Use dynamic timeseries-id
                                                        "ts-code": null,
                                                        "attribute": 2
                                                    };

                                                    // Append the new object to assigned-time-series
                                                    netmissTsidData['assigned-time-series'].push(newAssignedTimeSeries);

                                                    // Logging the updated object to verify the change
                                                    console.log(netmissTsidData);

                                                    if (netmissTsidData) {
                                                        netmissTsidMap.set(loc['location-id'], netmissTsidData);
                                                    }
                                                })
                                                .catch(error => {
                                                    console.error(`Problem with the fetch operation for stage TSID data at ${netmissTsidApiUrl}:`, error);
                                                })
                                        );
                                    }

                                    if ("metadata" === "metadata") {
                                        // Construct the URL for the location metadata request
                                        let locApiUrl = `https://coe-${office.toLocaleLowerCase()}uwa04${office.toLocaleLowerCase()}.${office.toLocaleLowerCase()}.usace.army.mil:8243/${office.toLocaleLowerCase()}-data/locations/${loc['location-id']}?office=${office}`;
                                        if (locApiUrl) {
                                            // Push the fetch promise to the metadataPromises array
                                            metadataPromises.push(
                                                fetch(locApiUrl)
                                                    .then(response => {
                                                        if (response.status === 404) {
                                                            console.warn(`Location metadata not found for location: ${loc['location-id']}`);
                                                            return null; // Skip processing if no metadata is found
                                                        }
                                                        if (!response.ok) {
                                                            throw new Error(`Network response was not ok: ${response.statusText}`);
                                                        }
                                                        return response.json();
                                                    })
                                                    .then(locData => {
                                                        if (locData) {
                                                            metadataMap.set(loc['location-id'], locData);
                                                        }
                                                    })
                                                    .catch(error => {
                                                        console.error(`Problem with the fetch operation for location ${loc['location-id']}:`, error);
                                                    })
                                            );
                                        }
                                    }
                                });
                            }
                        })
                        .catch(error => {
                            console.error(`Problem with the fetch operation for basin ${basin}:`, error);
                        })
                );
            });

            Promise.all(apiPromises)
                .then(() => Promise.all(netmissTsidPromises))
                .then(() => {
                    combinedData.forEach(basinData => {
                        if (basinData['assigned-locations']) {
                            basinData['assigned-locations'].forEach(loc => {
                                const netmissTsidMapData = netmissTsidMap.get(loc['location-id']);
                                console.log('netmissTsidMapData:', netmissTsidMapData);
                                reorderByAttribute(netmissTsidMapData);
                                if (netmissTsidMapData) {
                                    loc['tsid-netmiss'] = netmissTsidMapData;
                                }

                                const metadataMapData = metadataMap.get(loc['location-id']);
                                if (metadataMapData) {
                                    loc['metadata'] = metadataMapData;
                                }
                            });
                        }
                    });

                    console.log('combinedData:', combinedData);

                    // Fetch additional data using stageTsid, netmissTsid, nwsTsid
                    const additionalPromises = [];

                    for (const locData of combinedData[0][`assigned-locations`]) {
                        const stageTsid = locData[`tsid-netmiss`][`assigned-time-series`][0][`timeseries-id`];
                        const netmissTsid = locData[`tsid-netmiss`][`assigned-time-series`][1][`timeseries-id`];
                        const nwsTsid = locData[`tsid-netmiss`][`assigned-time-series`][2][`timeseries-id`];

                        // Example API calls for additional data (customize these URLs)
                        const stageApiUrl = `https://coe-${office}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries?name=${stageTsid}&begin=${currentDateTimeMinus30Hours.toISOString()}&end=${currentDateTime.toISOString()}&office=${office}`;
                        const netmissApiUrl = `https://coe-${office}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries?name=${netmissTsid}&begin=${currentDateTimeMinus30Hours.toISOString()}&end=${currentDateTime.toISOString()}&office=${office}`;
                        const nwsApiUrl = `https://coe-${office}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries?name=${nwsTsid}&begin=${currentDateTimeMinus30Hours.toISOString()}&end=${currentDateTime.toISOString()}&office=${office}`;

                        // Fetch additional data
                        additionalPromises.push(
                            Promise.all([
                                fetch(stageApiUrl, {
                                    method: 'GET',
                                    headers: {
                                        'Accept': 'application/json;version=2'
                                    }
                                }).then(res => res.json()),
                                fetch(netmissApiUrl, {
                                    method: 'GET',
                                    headers: {
                                        'Accept': 'application/json;version=2'
                                    }
                                }).then(res => res.json()),
                                fetch(nwsApiUrl, {
                                    method: 'GET',
                                    headers: {
                                        'Accept': 'application/json;version=2'
                                    }
                                }).then(res => res.json())
                            ])
                                .then(([stageData, netmissData, nwsData]) => {
                                    console.log('stageData:', stageData);
                                    console.log('netmissData:', netmissData);
                                    console.log('nwsData:', nwsData);

                                    if (stageData.values) {
                                        stageData.values.forEach(entry => {
                                            entry[0] = formatNWSDate(entry[0]);
                                        });
                                    }

                                    if (netmissData.values) {
                                        netmissData.values.forEach(entry => {
                                            entry[0] = formatNWSDate(entry[0]);
                                        });
                                    }

                                    if (nwsData.values) {
                                        nwsData.values.forEach(entry => {
                                            entry[0] = formatNWSDate(entry[0]);
                                        });
                                    }

                                    // Append the fetched data to the locData
                                    locData['stageData'] = stageData;
                                    locData['netmissData'] = netmissData;
                                    locData['nwsData'] = nwsData;

                                    // Execute the functions to find values and create the table
                                    const stageValuesAtPreferredTimes = findValuesAtTimes(stageData);
                                    console.log('stageValuesAtPreferredTimes:', stageValuesAtPreferredTimes);
                                    const netmissValuesAtPreferredTimes = findValuesAtTimes(netmissData);
                                    console.log('netmissValuesAtPreferredTimes:', netmissValuesAtPreferredTimes);
                                    const nwsValuesAtPreferredTimes = findValuesAtTimes(nwsData);
                                    console.log('nwsValuesAtPreferredTimes:', nwsValuesAtPreferredTimes);

                                    locData['stageDataPreferredTimes'] = stageValuesAtPreferredTimes;
                                    locData['netmissDataPreferredTimes'] = netmissValuesAtPreferredTimes;
                                    locData['nwsDataPreferredTimes'] = nwsValuesAtPreferredTimes;
                                })
                                .catch(error => {
                                    console.error(`Error fetching additional data for location ${locData['location-id']}:`, error);
                                })
                        );
                    }

                    // Wait for all additional data fetches to complete
                    return Promise.all(additionalPromises);
                })
                .then(() => {
                    console.log('All data fetched successfully:', combinedData);

                    // Append the table to the specified container
                    const container = document.getElementById('table_container_alarm_netmiss_check');
                    const table = createTable(combinedData);
                    container.appendChild(table);

                    loadingIndicator.style.display = 'none';
                })
                .catch(error => {
                    console.error('There was a problem with one or more fetch operations:', error);
                    loadingIndicator.style.display = 'none';
                });
        })
        .catch(error => {
            console.error('There was a problem with the initial fetch operation:', error);
            loadingIndicator.style.display = 'none';
        });
});

function filterByLocationCategory(array, category) {
    return array.filter(item =>
        item['location-category'] &&
        item['location-category']['office-id'] === category['office-id'] &&
        item['location-category']['id'] === category['id']
    );
}

// Function to get current data time
function subtractHoursFromDate(date, hoursToSubtract) {
    return new Date(date.getTime() - (hoursToSubtract * 60 * 60 * 1000));
}

// Function to convert timestamp to specified format
function formatNWSDate(timestamp) {
    const date = new Date(timestamp);
    const mm = String(date.getMonth() + 1).padStart(2, '0'); // Month
    const dd = String(date.getDate()).padStart(2, '0'); // Day
    const yyyy = date.getFullYear(); // Year
    const hh = String(date.getHours()).padStart(2, '0'); // Hours
    const min = String(date.getMinutes()).padStart(2, '0'); // Minutes
    return `${mm}-${dd}-${yyyy} ${hh}:${min}`;
}

// Function to reorder based on attribute
const reorderByAttribute = (data) => {
    data['assigned-time-series'].sort((a, b) => a.attribute - b.attribute);
};

// Function to format time to get 6am
const formatTime = (date) => {
    const pad = (num) => (num < 10 ? '0' + num : num);
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Function to get 6am, 5am and 7am
const findValuesAtTimes = (data) => {
    const result = [];
    const currentDate = new Date();

    // Create time options for 5 AM, 6 AM, and 7 AM today in Central Standard Time
    const timesToCheck = [
        new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 6, 0), // 6 AM CST
        new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 5, 0), // 5 AM CST
        new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 7, 0)  // 7 AM CST
    ];

    const foundValues = [];

    // Iterate over the values in the provided data
    const values = data.values;

    // Check for each time in the order of preference
    timesToCheck.forEach((time) => {
        // Format the date-time to match the format in the data
        const formattedTime = formatTime(time);

        const entry = values.find(v => v[0] === formattedTime);
        if (entry) {
            foundValues.push({ time: formattedTime, value: entry[1] }); // Store both time and value if found
        } else {
            foundValues.push({ time: formattedTime, value: null }); // Store null if not found
        }
    });

    // Push the result for this data entry
    result.push({
        name: data.name,
        values: foundValues // This will contain the array of { time, value } objects
    });

    return result;
};

// Function to extract the am value for table
function getValidValue(values) {
    // Get the first non-null value from the values array
    const validValue = values.find(valueEntry => valueEntry.value !== null);
    return validValue ? (validValue.value).toFixed(2) : 'N/A';
}

function createTable(data) {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // Create table header
    const headerRow = document.createElement('tr');
    const headers = ['Location', 'Stage', 'Netmiss', 'NWS'];
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Populate table rows
    data.forEach(entry => {
        entry['assigned-locations'].forEach(location => {
            const row = document.createElement('tr');

            const locationId = location["location-id"];
            const stageValue = getValidValue(location.stageDataPreferredTimes[0].values);
            const netmissValue = getValidValue(location.netmissDataPreferredTimes[0].values);
            const nwsValue = getValidValue(location.nwsDataPreferredTimes[0].values);

            // Create a link for stageValue
            const stageLink = document.createElement('a');
            stageLink.href = `https://wm.mvs.ds.usace.army.mil/district_templates/chart/index.html?office=MVS&cwms_ts_id=${location[`tsid-netmiss`][`assigned-time-series`][0][`timeseries-id`]}&cwms_ts_id_2=${location[`tsid-netmiss`][`assigned-time-series`][1][`timeseries-id`]}&lookforward=96`; // URL with location name
            stageLink.textContent = stageValue; // Displayed text
            stageLink.target = '_blank'; // Opens link in a new tab

            // Set the inner HTML for the row
            row.innerHTML = `
                <td>${locationId}</td>
                <td></td>
                <td>${netmissValue}</td>
                <td>${nwsValue}</td>
            `;

            // Append the link to the second cell (stage column)
            row.cells[1].appendChild(stageLink);
            tbody.appendChild(row);
        });
    });

    table.appendChild(tbody);

    // Set widths for columns
    const columnWidths = ['40%', '20%', '20%', '20%'];

    // Set the width for header cells
    Array.from(table.getElementsByTagName('th')).forEach((th, index) => {
        th.style.width = columnWidths[index];
    });

    // Set the width for body cells
    Array.from(table.getElementsByTagName('td')).forEach((td, index) => {
        td.style.width = columnWidths[index % columnWidths.length]; // Use modulus to cycle through widths
    });

    return table;
}