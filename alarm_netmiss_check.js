// Create a new Date object
var currentDateNetmiss = new Date();

var office = "MVS";

// Get current date and time
const currentDateTime = new Date();
// console.log('currentDateTime:', currentDateTime);

// Subtract two hours from current date and time
const currentDateTimeMinus2Hours = subtractHoursFromDate(currentDateTime, 2);
// console.log('currentDateTimeMinus2Hours :', currentDateTimeMinus2Hours);

// Subtract two hours from current date and time
const currentDateTimeMinus8Hours = subtractHoursFromDate(currentDateTime, 8);
// console.log('currentDateTimeMinus8Hours :', currentDateTimeMinus8Hours);

// Subtract thirty hours from current date and time
const currentDateTimeMinus30Hours = subtractHoursFromDate(currentDateTime, 8);
// console.log('currentDateTimeMinus30Hours :', currentDateTimeMinus30Hours);

// Add thirty hours to current date and time
const currentDateTimePlus30Hours = plusHoursFromDate(currentDateTime, 30);
// console.log('currentDateTimePlus30Hours :', currentDateTimePlus30Hours);

// Add four days to current date and time
const currentDateTimePlus4Days = addDaysToDate(currentDateTime, 4);
// console.log('currentDateTimePlus4Days :', currentDateTimePlus4Days);

// Get the current hour
var currentHourNetmiss = currentDateNetmiss.getHours();
var currentMinutesNetmiss = currentDateNetmiss.getMinutes();

console.log("currentHourNetmiss: " + currentHourNetmiss);
console.log("currentMinutesNetmiss: " + currentMinutesNetmiss);

document.addEventListener('DOMContentLoaded', function () {
    // Display the loading_alarm_mvs indicator
    const coloadingIndicatorNetmissCheck = document.getElementById('loading_alarm_netmiss_check');
    const coloadingIndicatorNetmissCheckFailed = document.getElementById('loading_alarm_netmiss_check_failed');
    coloadingIndicatorNetmissCheck.style.display = 'block';

    const jsonFile = 'netmiss_check.json';

    fetch('json/' + jsonFile)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log("data: ", data);

            // Check if data_items array is present in the data
            const dataItems = data;

            if (Array.isArray(dataItems) && dataItems.length > 0) {
                // Create an array of promises for each fetch
                const fetchPromises = dataItems.map(item => {
                    const project_id = item.project_id;

                    const cwmsKeys = Object.keys(item).filter(key => key.startsWith('tsid'));

                    const fetchPromisesForProjectId = cwmsKeys.flatMap(cwmsKey => {
                        const cwmsData = item[cwmsKey];
                        const tsIdStage = cwmsData.stage_cwms_ts_id;
                        const tsIdNetmiss = cwmsData.netmiss_cwms_ts_id;
                        const tsIdNws = cwmsData.nws_cwms_ts_id;

                        // Create an array of URLs to fetch for each tsId
                        const tsIds = [tsIdStage, tsIdNetmiss, tsIdNws];
                        return tsIds.map(tsId => {
                            const fetchUrl = `https://coe-${office}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries?name=${tsId}&begin=${currentDateTimeMinus30Hours.toISOString()}&end=${currentDateTime.toISOString()}&office=${office}`;
                            console.log('fetchUrl:', fetchUrl);

                            // Return the fetch promise
                            return new Promise((resolve, reject) => {
                                const abortController = new AbortController();
                                const signal = abortController.signal;

                                // Set a timeout to abort the fetch request
                                const timeoutId = setTimeout(() => {
                                    reject(new Error('Timeout'));
                                    coloadingIndicatorNetmissCheckFailed.style.width = '60px';
                                    coloadingIndicatorNetmissCheckFailed.style.height = '60px';
                                    coloadingIndicatorNetmissCheckFailed.style.backgroundColor = 'red';
                                    coloadingIndicatorNetmissCheckFailed.style.borderRadius = '50%';
                                }, 30000); // 30 seconds

                                fetch(fetchUrl, {
                                    method: 'GET',
                                    headers: {
                                        'Accept': 'application/json;version=2'
                                    },
                                    signal
                                })
                                    .then(response => {
                                        clearTimeout(timeoutId); // Clear the timeout if the fetch completes before the timeout
                                        if (!response.ok) {
                                            throw new Error('Network response was not ok');
                                        }
                                        return response.json();
                                    })
                                    .then(data => {
                                        // Process the `values` array to format the timestamps
                                        if (data.values) {
                                            data.values.forEach(entry => {
                                                entry[0] = formatNWSDate(entry[0]); // Update timestamp
                                            });
                                        }
                                        resolve(data);
                                    })
                                    .catch(error => {
                                        reject(error);
                                    });
                            });
                        });
                    });

                    // Return the promises for the current project
                    return Promise.all(fetchPromisesForProjectId);
                });

                // Execute all fetch operations concurrently
                return Promise.all(fetchPromises);
            } else {
                throw new Error('No data items found in the array or the array is empty');
            }

        })
        .then(dataArrayNetmissCheck => {
            // Handle the combined data from the second fetch
            console.log('dataArrayNetmissCheck:', dataArrayNetmissCheck);

            // Function to format time in the desired format (MM-DD-YYYY HH:mm)
            const formatTime = (date) => {
                const pad = (num) => (num < 10 ? '0' + num : num);
                return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
            };

            // Function to find values at specified times
            const findValuesAtTimes = (dataArray) => {
                const result = [];
                const currentDate = new Date();

                // Create time options for 6 AM, 7 AM, and 5 AM today
                const timesToCheck = [
                    new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 6, 0), // 6 AM
                    new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 7, 0), // 7 AM
                    new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 5, 0)  // 5 AM
                ].map(formatTime);

                dataArray.forEach(dataSet => {
                    dataSet.forEach(data => {
                        const values = data.values;
                        let foundValues = [null, null, null]; // Initialize with null values

                        // Check for each time in the order of preference
                        for (let i = 0; i < timesToCheck.length; i++) {
                            const entry = values.find(v => v[0] === timesToCheck[i]);
                            if (entry) {
                                foundValues[i] = entry[1]; // Store value if found
                            }
                        }

                        // Push the row with the name and found values
                        result.push({
                            name: data.name,
                            values: foundValues // This will contain [value6AM, value7AM, value5AM]
                        });
                    });
                });

                return result;
            };

            // Execute the functions to find values and create the table
            const valuesAtPreferredTimes = findValuesAtTimes(dataArrayNetmissCheck);
            console.log('valuesAtPreferredTimes:', valuesAtPreferredTimes);

            // Transform the array
            const transformedData = valuesAtPreferredTimes.reduce((acc, current) => {
                // Split the name to get the prefix
                const prefix = current.name.split('.')[0];

                // If the prefix doesn't exist in the accumulator, create it
                if (!acc[prefix]) {
                    acc[prefix] = [];
                }

                // Push the current item into the appropriate prefix array
                acc[prefix].push(current);

                return acc;
            }, {});

            // Convert the result back into an array of objects
            const resultArray = Object.entries(transformedData).map(([key, value]) => ({
                prefix: key,
                data: value
            }));

            console.log(resultArray);


            // Create a table
            const table = document.createElement('table');

            // Create table header
            const headerRow = document.createElement('tr');
            const headers = ['Location', 'Stage', 'Netmiss', 'NWS'];
            headers.forEach(headerText => {
                const header = document.createElement('th');
                header.textContent = headerText;
                headerRow.appendChild(header);
            });
            table.appendChild(headerRow);

            // Populate the table with data
            resultArray.forEach(item => {
                const row = document.createElement('tr');

                // Add location
                const locationCell = document.createElement('td');
                locationCell.textContent = item.prefix; // Retain the original prefix as the location
                row.appendChild(locationCell);

                // Get the first non-null value from each dataset
                const values = item.data.map(d => {
                    for (let value of d.values) {
                        if (value !== null) {
                            return value; // Return the first non-null value
                        }
                    }
                    return null; // Return null if all are null
                });

                values.forEach((value, index) => {
                    const cell = document.createElement('td');
                    cell.textContent = value !== null ? value.toFixed(2) : 'N/A'; // Format value and handle nulls
                    row.appendChild(cell);
                });

                // Fill remaining cells with 'N/A' if fewer than 3 values
                while (values.length < 3) {
                    const cell = document.createElement('td');
                    cell.textContent = 'N/A';
                    row.appendChild(cell);
                    values.push(null); // Push null to keep the count correct
                }

                table.appendChild(row);
            });

            // Append the table to the container
            const container = document.getElementById('table_container_alarm_netmiss_check');
            container.appendChild(table);

            // Hide the loading_alarm_mvs indicator
            coloadingIndicatorNetmissCheck.style.display = 'none';
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        })
        .finally(() => {
            // Hide the loading_alarm_mvs indicator regardless of success or failure
            coloadingIndicatorNetmissCheck.style.display = 'none';
        });
});

function createTableNetmissCheck(dataArrayNetmissCheck) {
    const table = document.createElement('table');
    table.id = 'customers';

    // Create header row
    let headerRow = table.insertRow();
    let columnsToShow = ["location_id_am", "value_am", "value_netmiss", "value_nws"];
    columnsToShow.forEach(column => {
        let th = document.createElement("th");
        th.textContent = column;
        th.style.width = "25%";
        headerRow.appendChild(th);
    });

    // Create data rows
    dataArrayNetmissCheck.forEach(dataSet => {
        dataSet.forEach(data => {
            let row = table.insertRow();
            columnsToShow.forEach(column => {
                let cell = row.insertCell();
                //cell.innerHTML = data[column];

                if (column === "location_id_am") {
                    cell.innerHTML = data[column];
                }

                if (column === "value_am") {
                    cell.innerHTML = '<a href="https://wm.mvs.ds.usace.army.mil/web_apps/plot_macro/public/plot_macro.php?cwms_ts_id=' + data.cwms_ts_id_am + '&start_day=4&end_day=0" target="_blank">' + data[column] + '</a>';
                }

                // Add date_time_am as title to cells in value_am, value_netmiss, and value_nws columns
                if (column === "value_am") {
                    cell.title = data.date_time_am + " " + data.cwms_ts_id_am;
                }

                if (column === "value_netmiss") {
                    cell.title = data.date_time_netmiss + " " + data.cwms_ts_id_netmiss;
                    const delta = parseFloat(data.value_am) - parseFloat(data.value_netmiss);
                    if (!isNaN(delta)) {
                        // Set background color to red if delta is greater than 5
                        if (delta > 0.49 || delta < -0.49) {
                            cell.innerHTML = '<a href="https://wm.mvs.ds.usace.army.mil/web_apps/plot_macro/public/plot_macro.php?cwms_ts_id=' + data.cwms_ts_id_netmiss + '&start_day=1&end_day=4" target="_blank" style="color: lightgray;">' + data[column] + '</a>' + "<span style='margin-left:10px;'>" + "(" + delta.toFixed(1) + ")" + "</span>";
                            cell.style.backgroundColor = "purple";
                            cell.style.color = "lightgray";
                        } else if (delta >= 0.25) {
                            cell.innerHTML = '<a href="https://wm.mvs.ds.usace.army.mil/web_apps/plot_macro/public/plot_macro.php?cwms_ts_id=' + data.cwms_ts_id_netmiss + '&start_day=1&end_day=4" target="_blank">' + data[column] + '</a>' + "<span style='margin-left:10px;'>" + "(" + delta.toFixed(1) + ")" + "</span>";
                            cell.style.backgroundColor = "pink";
                        } else if (delta <= -0.25) {
                            cell.innerHTML = '<a href="https://wm.mvs.ds.usace.army.mil/web_apps/plot_macro/public/plot_macro.php?cwms_ts_id=' + data.cwms_ts_id_netmiss + '&start_day=1&end_day=4" target="_blank">' + data[column] + '</a>' + "<span style='margin-left:10px;'>" + "(" + delta.toFixed(1) + ")" + "</span>";
                            cell.style.backgroundColor = "DodgerBlue";
                        } else {
                            cell.innerHTML = '<a href="https://wm.mvs.ds.usace.army.mil/web_apps/plot_macro/public/plot_macro.php?cwms_ts_id=' + data.cwms_ts_id_netmiss + '&start_day=1&end_day=4" target="_blank">' + data[column] + '</a>' + "<span style='margin-left:10px;'>" + "(" + delta.toFixed(1) + ")" + "</span>";
                            cell.style.backgroundColor = "MediumSeaGreen";
                        }
                    } else if (column === "value_netmiss" && (!isNaN(data[column]))) {
                        cell.innerHTML += "<span style='margin-left:10px;'>" + "--" + "</span>";
                    } else {
                        cell.innerHTML += "<span style='margin-left:10px;'>" + "Today's forecast was completed. Check again 6am tomorrow." + "</span>";
                        cell.style.backgroundColor = "MediumSeaGreen";
                    }
                }


                if (column === "value_nws") {
                    cell.title = data.date_time_nws + " " + data.cwms_ts_id_nws;
                    const delta = parseFloat(data.value_am) - parseFloat(data.value_nws);
                    if (!isNaN(delta)) {
                        // Set background color to red if delta is greater than 5
                        if (delta > 0.49 || delta < -0.49) {
                            cell.innerHTML = '<a href="https://wm.mvs.ds.usace.army.mil/web_apps/plot_macro/public/plot_macro.php?cwms_ts_id=' + data.cwms_ts_id_nws + '&start_day=1&end_day=4" target="_blank" style="color: lightgray;">' + data[column] + '</a>' + "<span style='margin-left:10px;'>" + "(" + delta.toFixed(1) + ")" + "</span>";
                            cell.style.backgroundColor = "purple";
                            cell.style.color = "lightgray";
                        } else if (delta >= 0.25) {
                            cell.innerHTML = '<a href="https://wm.mvs.ds.usace.army.mil/web_apps/plot_macro/public/plot_macro.php?cwms_ts_id=' + data.cwms_ts_id_nws + '&start_day=1&end_day=4" target="_blank">' + data[column] + '</a>' + "<span style='margin-left:10px;'>" + "(" + delta.toFixed(1) + ")" + "</span>";
                            cell.style.backgroundColor = "pink";
                        } else if (delta <= -0.25) {
                            cell.innerHTML = '<a href="https://wm.mvs.ds.usace.army.mil/web_apps/plot_macro/public/plot_macro.php?cwms_ts_id=' + data.cwms_ts_id_nws + '&start_day=1&end_day=4" target="_blank">' + data[column] + '</a>' + "<span style='margin-left:10px;'>" + "(" + delta.toFixed(1) + ")" + "</span>";
                            cell.style.backgroundColor = "DodgerBlue";
                        } else {
                            cell.innerHTML = '<a href="https://wm.mvs.ds.usace.army.mil/web_apps/plot_macro/public/plot_macro.php?cwms_ts_id=' + data.cwms_ts_id_nws + '&start_day=1&end_day=4" target="_blank">' + data[column] + '</a>' + "<span style='margin-left:10px;'>" + "(" + delta.toFixed(1) + ")" + "</span>";
                            cell.style.backgroundColor = "MediumSeaGreen";
                        }
                    } else {
                        cell.innerHTML = "<span style='margin-left:10px;'>" + "--" + "</span>";
                        cell.style.backgroundColor = "MediumSeaGreen";
                    }
                }
            });
        });
    });

    return table;
}

function shouldCreateTableNetmissCheck(currentHourNetmiss) {
    //return currentHourNetmiss > 6 && currentHourNetmiss < 12;
    return currentHourNetmiss >= 0; // Make table available all the time, not between 6 and 12 per water managers
}

function createTableHTMLNetmissCheck(dataArrayNetmissCheck) {
    const table = createTableNetmissCheck(dataArrayNetmissCheck);
    return table.outerHTML;
}

/******************************************************************************
 *                            SUPPORT CDA FUNCTIONS                           *
 ******************************************************************************/
// Function to get current data time
function subtractHoursFromDate(date, hoursToSubtract) {
    return new Date(date.getTime() - (hoursToSubtract * 60 * 60 * 1000));
}

// Function to get current data time
function plusHoursFromDate(date, hoursToSubtract) {
    return new Date(date.getTime() + (hoursToSubtract * 60 * 60 * 1000));
}

// Function to add days to a given date
function addDaysToDate(date, days) {
    return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

// Function to convert cda date time to mm-dd-yyyy 24hh:mi
function formatTimestampToString(timestampLast) {
    const date = new Date(timestampLast);
    const formattedDate = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}-${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    return formattedDate;
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

// Function to extract values where time ends in "13:00"
function extractValuesWithTimeNoon(values) {
    return values.filter(entry => {
        const timestamp = new Date(entry[0]);
        const hours = timestamp.getHours();
        const minutes = timestamp.getMinutes();
        return (hours === 7 || hours === 6) && minutes === 0; // Check if time is 13:00
    });
}

// Function to find the c_count for each interval id
function calculateCCount(tsid) {
    // Split the string at the period
    const splitString = tsid.split('.');

    // Access the fifth element
    const forthElement = splitString[3];
    // console.log("forthElement = ", forthElement);

    // Initialize c_count variable
    let c_count;

    // Set c_count based on the value of firstTwoCharacters
    switch (forthElement) {
        case "15Minutes":
            c_count = 96;
            break;
        case "10Minutes":
            c_count = 144;
            break;
        case "30Minutes":
            c_count = 48;
            break;
        case "1Hour":
            c_count = 24;
            break;
        case "6Hours":
            c_count = 4;
            break;
        case "~2Hours":
            c_count = 12;
            break;
        case "5Minutes":
            c_count = 288;
            break;
        case "~1Day":
            c_count = 1;
            break;
        default:
            // Default value if forthElement doesn't match any case
            c_count = 0;
    }

    return c_count;
}

// Convert date time object to ISO format for CDA
function generateDateTimeMidNightStringsISO(currentDateTime, currentDateTimePlus4Days) {
    // Convert current date and time to ISO string
    const currentDateTimeISO = currentDateTime.toISOString();
    // Extract the first 10 characters from the ISO string
    const first10CharactersDateTimeISO = currentDateTimeISO.substring(0, 10);

    // Get midnight in the Central Time zone
    const midnightCentral = new Date(currentDateTime.toLocaleDateString('en-US', { timeZone: 'America/Chicago' }));
    midnightCentral.setHours(0, 0, 0, 0); // Set time to midnight

    // Convert midnight to ISO string
    const midnightCentralISO = midnightCentral.toISOString();

    // Append midnight central time to the first 10 characters of currentDateTimeISO
    const currentDateTimeMidNightISO = first10CharactersDateTimeISO + midnightCentralISO.substring(10);

    // Convert currentDateTimePlus4Days to ISO string
    const currentDateTimePlus4DaysISO = currentDateTimePlus4Days.toISOString();
    // Extract the first 10 characters from the ISO string of currentDateTimePlus4Days
    const first10CharactersDateTimePlus4DaysISO = currentDateTimePlus4DaysISO.substring(0, 10);

    // Append midnight central time to the first 10 characters of currentDateTimePlus4DaysISO
    const currentDateTimePlus4DaysMidNightISO = first10CharactersDateTimePlus4DaysISO + midnightCentralISO.substring(10);

    return {
        currentDateTimeMidNightISO,
        currentDateTimePlus4DaysMidNightISO
    };
}