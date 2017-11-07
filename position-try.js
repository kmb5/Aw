/**
*
* Average Position Bidding Tool
*
* This script changes keyword bids so that they target specified positions,
* based on recent performance.
*
* Version: 1.5
* Updated 2015-09-28 to correct for report column name changes
* Updated 2016-02-05 to correct label reading, add extra checks and
* be able to adjust maximum bid increases and decreases separately
* Updated 2016-08-30 to correct label reading from reports
* Updated 2016-09-14 to update keywords in batches
* Updated 2016-10-26 to avoid DriveApp bug
* Google AdWords Script maintained on brainlabsdigital.com
*
**/
/**
 * Original Version: http://www.brainlabsdigital.com/adwords-script-real-time-position-bidding/
 *
 * Modified by holger.schulz@data-inside.de to enable multi account use and auto update.
 * https://www.internet-marketing-inside.de/AdWords-Scripts/average-position-bidding-tool.html
 *
 * Privacy policy: No data from your AdWords account will be transferred to us or third parties. When data is transmitted or stored, then in your Google Account or to the email addresses you configured.
 *
 * Disclaimer: This AdWords Scripts lib can be used by anyone at no charge. Use is granted without guarantee or liability.
 */

 
// Options
/* /* DISABLED by HS. Must be defined in every account
var maxBid = 3.00;
// Bids will not be increased past this maximum.
   
var minBid = 0.15;
// Bids will not be decreased below this minimum.
var firstPageMaxBid = 0.90;
// The script avoids reducing a keyword's bid below its first page bid estimate. If you think
// Google's first page bid estimates are too high then use this to overrule them.
*/
// NEW by HS
var bConsiderMobileDevice = (typeof(considerMobileDevice) != "undefined") ? considerMobileDevice : false; // why default false???
var sLabelName = ((typeof(labelName) != "undefined") && (labelName.length >= 3)) ? labelName.trim().toLowerCase()+" " : "position "; // append space and toLowerCase!
/* DISABLED by HS and replaced
var dataFile = "AveragePositionData.txt";
*/
var dirForDataFiles = (typeof(dirForDataFiles) != "undefined") ? dirForDataFiles : "AdWordsScripts/AveragePositionData/"; // override to save somewhere else
var dataFile = dirForDataFiles+"AveragePositionData_"+AdWordsApp.currentAccount().getCustomerId()+"_"+sLabelName.trim()+".txt";
// This name is used to create a file in your Google Drive to store today's performance so far,
// for reference the next time the script is run.
   
var useFirstPageBidsOnKeywordsWithNoImpressions = (typeof(firstPageBidsOnKeywordsWithNoImpressions) != "undefined") ? firstPageBidsOnKeywordsWithNoImpressions : false;
// If this is true, then if a keyword has had no impressions since the last time the script was run
// its bid will be increased to the first page bid estimate (or the firsPageMaxBid if that is smaller).
// If this is false, keywords with no recent impressions will be left alone.

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
   
// Advanced Options
var bidIncreaseProportion = (typeof(bidIncreaseProp) != "undefined") ? bidIncreaseProp : 0.2;
var bidDecreaseProportion = (typeof(bidDecreaseProp) != "undefined") ? bidDecreaseProp : 0.2;
var targetPositionTolerance = (typeof(targetPositionPlusMinus) != "undefined") ? targetPositionPlusMinus : 0.3;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
   
//function main() {
function mainImpl() {
  //Logger.log(bConsiderMobileDevice+", "+sLabelName+", "+dirForDataFiles+", "+dataFile+", "+useFirstPageBidsOnKeywordsWithNoImpressions+", "+bidIncreaseProportion+", "+bidDecreaseProportion+", "+targetPositionTolerance);   
     
  var fieldJoin = ",";
  var lineJoin = "$";
  var idJoin = "#";
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  /* DISABLED by holger.schulz@data-inside.de
  var files = DriveApp.getFilesByName(dataFile);
  if (!files.hasNext()) {
    var file = DriveApp.createFile(dataFile,"\n");
    Logger.log("File '" + dataFile + "' has been created.");
  } else {
    var file = files.next();
    if (files.hasNext()) {
      Logger.log("Error - more than one file named '" + dataFile + "'");
      return;
    }
    Logger.log("File '" + dataFile + "' has been read.");
  }
   */
  var file = getOrCreateTextFileInFolder(dataFile,"\n");
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  var labelIds = [];
  var sDebugLabelNames = "";
  
  var labelIterator = AdWordsApp.labels()
  .withCondition("KeywordsCount > 0")
  .withCondition("LabelName CONTAINS_IGNORE_CASE '"+sLabelName+"'")
  .get();
     
  while (labelIterator.hasNext()) {
    var label = labelIterator.next();
    if (label.getName().substr(0,sLabelName.length).toLowerCase() == sLabelName) {
      labelIds.push(label.getId());
      sDebugLabelNames += label.getName()+", ";
    }
  }
     
  if (labelIds.length == 0) {
    Logger.log("No "+sLabelName+"labels found.");
    return;
  }
  Logger.log(labelIds.length + " "+sLabelName+"labels have been found.");
  Logger.log("These labels have been found: "+sDebugLabelNames);
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  var keywordData = {
    //UniqueId1: {LastHour: {Impressions: , AveragePosition: }, ThisHour: {Impressions: , AveragePosition: },
    //CpcBid: , FirstPageCpc: , MaxBid, MinBid, FirstPageMaxBid, PositionTarget: , CurrentAveragePosition:,
    //Criteria: }
  }
     
  var ids = [];
  var uniqueIds = [];
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  var report = AdWordsApp.report(
    'SELECT Id, Criteria, AdGroupId, AdGroupName, CampaignName, Impressions, AveragePosition, CpcBid, FirstPageCpc, Labels, BiddingStrategyType ' +
    'FROM KEYWORDS_PERFORMANCE_REPORT ' +
    'WHERE Status = ENABLED AND AdGroupStatus = ENABLED AND CampaignStatus = ENABLED ' +
    'AND LabelIds CONTAINS_ANY [' + labelIds.join(",") + '] ' +
    'AND AdNetworkType2 = SEARCH ' +
      ((bConsiderMobileDevice === false) ? 'AND Device NOT_IN ["HIGH_END_MOBILE"] ' : ' ') +
        'DURING TODAY'
      );
     
  var rows = report.rows();
     
  while(rows.hasNext()){
    var row = rows.next();
       
    if (row["BiddingStrategyType"] != "cpc") {
      if (row["BiddingStrategyType"] == "Enhanced CPC"
          || row["BiddingStrategyType"] == "Target search page location"
          || row["BiddingStrategyType"] == "Target Outranking Share"
          || row["BiddingStrategyType"] == "None"
          || row["BiddingStrategyType"] == "unknown") {
        Logger.log("Warning: keyword " + row["Criteria"] + "' in campaign '" + row["CampaignName"] +
                   "' uses '" + row["BiddingStrategyType"] + "' rather than manual CPC. This may overrule keyword bids and interfere with the script working.");
      } else {
        Logger.log("Warning: keyword " + row["Criteria"] + "' in campaign '" + row["CampaignName"] +
                   "' uses the bidding strategy '" + row["BiddingStrategyType"] + "' rather than manual CPC. This keyword will be skipped.");
        continue;
      }
    }
       
    var positionTarget = "";
       
    if (row["Labels"].trim() == "--") {
      continue;
    }
    var labels = JSON.parse(row["Labels"].toLowerCase()); // Labels are returned as a JSON formatted string
       
    for (var i=0; i<labels.length; i++) {
      if (labels[i].substr(0,sLabelName.length) == sLabelName) {
        var positionTarget = parseFloat(labels[i].substr(sLabelName.length-1).replace(/,/g,"."),10);
        break;
      }
    }
    if (positionTarget == "") {
      continue;
    }
    if (integrityCheck(positionTarget) == -1) {
      Logger.log("Invalid position target '" + positionTarget +  "' for keyword '" + row["Criteria"] + "' in campaign '" + row["CampaignName"] + "'");
      continue;
    }
       
    ids.push(parseFloat(row['Id'],10));
    var uniqueId = row['AdGroupId'] + idJoin + row['Id'];
    uniqueIds.push(uniqueId);
       
    keywordData[uniqueId] = {};
    keywordData[uniqueId]['Criteria'] = row['Criteria'];
    keywordData[uniqueId]['ThisHour'] = {};
       
    keywordData[uniqueId]['ThisHour']['Impressions'] = parseFloat(row['Impressions'].replace(/,/g,""),10);
    keywordData[uniqueId]['ThisHour']['AveragePosition'] = parseFloat(row['AveragePosition'].replace(/,/g,""),10);
       
    keywordData[uniqueId]['CpcBid'] = parseFloat(row['CpcBid'].replace(/,/g,""),10);
    keywordData[uniqueId]['FirstPageCpc'] = parseFloat(row['FirstPageCpc'].replace(/,/g,""),10);
       
    setPositionTargets(uniqueId, positionTarget);
  }
    
  Logger.log(uniqueIds.length + " labelled keywords found");
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  setBidChange();
  setMinMaxBids();
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  var currentHour = parseInt(Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), "HH"), 10);
     
  if (currentHour != 0) {
    var data = file.getBlob().getDataAsString();
    var data = data.split(lineJoin);
    for(var i = 0; i < data.length; i++){
      data[i] = data[i].split(fieldJoin);
      var uniqueId = data[i][0];
      if(keywordData.hasOwnProperty(uniqueId)){
        keywordData[uniqueId]['LastHour'] = {};
        keywordData[uniqueId]['LastHour']['Impressions'] = parseFloat(data[i][1],10);
        keywordData[uniqueId]['LastHour']['AveragePosition'] = parseFloat(data[i][2],10);
      }
    }
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  findCurrentAveragePosition();
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  //Batch the keyword IDs, as the iterator can't take them all at once
  var idBatches = [];
  var batchSize = 5000;
  for (var i=0; i<uniqueIds.length; i += batchSize) {
    idBatches.push(uniqueIds.slice(i,i+batchSize));
  }
    
  Logger.log("Updating keywords");
     
  // Update each batch
  for (var i=0; i<idBatches.length; i++) {
    try {
      updateKeywords(idBatches[i]);
    } catch (e) {
      Logger.log("Error updating keywords: " + e);
      Logger.log("Retrying after one minute.");
      Utilities.sleep(60000);
      updateKeywords(idBatches[i]);
    }
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  Logger.log("Writing file.");
  var content = resultsString();
  file.setContent(content);
    
  Logger.log("Finished.");
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  // Functions
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function integrityCheck(target){
    var n = parseFloat(target, 10);
    if(!isNaN(n) && n >= 1){
      return n;
    }
    else{
      return -1;
    }
       
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function setPositionTargets(uniqueId, target){
    if(target !== -1){
      keywordData[uniqueId]['HigherPositionTarget'] = Math.max(target-targetPositionTolerance, 1);
      keywordData[uniqueId]['LowerPositionTarget'] = target+targetPositionTolerance;
    }
    else{
      keywordData[uniqueId]['HigherPositionTarget'] = -1;
      keywordData[uniqueId]['LowerPositionTarget'] = -1;
    }
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function bidChange(uniqueId){
       
    var newBid = -1;
    if(keywordData[uniqueId]['HigherPositionTarget'] === -1){
      return newBid;
    }
       
    var cpcBid = keywordData[uniqueId]['CpcBid'];
    var minBid = keywordData[uniqueId]['MinBid'];
    var maxBid = keywordData[uniqueId]['MaxBid'];
       
    if (isNaN(keywordData[uniqueId]['FirstPageCpc'])) {
      Logger.log("Warning: first page CPC estimate is not a number for keyword '" + keywordData[uniqueId]['Criteria'] + "'. This keyword will be skipped");
      return -1;
    }
       
    var firstPageBid = Math.min(keywordData[uniqueId]['FirstPageCpc'], keywordData[uniqueId]['FirstPageMaxBid'], maxBid);
       
    var currentPosition = keywordData[uniqueId]['CurrentAveragePosition'];
    var higherPositionTarget = keywordData[uniqueId]['HigherPositionTarget'];
    var lowerPositionTarget = keywordData[uniqueId]['LowerPositionTarget'];
       
    var bidIncrease = keywordData[uniqueId]['BidIncrease'];
    var bidDecrease = keywordData[uniqueId]['BidDecrease'];
       
    if((currentPosition > lowerPositionTarget) && (currentPosition !== 0)){
      var linearBidModel = Math.min(2*bidIncrease,(2*bidIncrease/lowerPositionTarget)*(currentPosition-lowerPositionTarget));
      var newBid = Math.min((cpcBid + linearBidModel), maxBid);
    }
    if((currentPosition < higherPositionTarget) && (currentPosition !== 0)) {
      var linearBidModel = Math.min(2*bidDecrease,((-4)*bidDecrease/higherPositionTarget)*(currentPosition-higherPositionTarget));
      var newBid = Math.max((cpcBid-linearBidModel),minBid);
      if (cpcBid > firstPageBid) {
        var newBid = Math.max(firstPageBid,newBid);
      }
    }
    if((currentPosition === 0) && useFirstPageBidsOnKeywordsWithNoImpressions && (cpcBid < firstPageBid)){
      var newBid = firstPageBid;
    }
       
    if (isNaN(newBid)) {
      Logger.log("Warning: new bid is not a number for keyword '" + keywordData[uniqueId]['Criteria'] + "'. This keyword will be skipped");
      return -1;
    }
       
    return newBid;
       
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function findCurrentAveragePosition(){
    for(var x in keywordData){
      if(keywordData[x].hasOwnProperty('LastHour')){
        keywordData[x]['CurrentAveragePosition'] = calculateAveragePosition(keywordData[x]);
      } else {
        keywordData[x]['CurrentAveragePosition'] = keywordData[x]['ThisHour']['AveragePosition'];
      }
    }
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function calculateAveragePosition(keywordDataElement){
    var lastHourImpressions = keywordDataElement['LastHour']['Impressions'];
    var lastHourAveragePosition = keywordDataElement['LastHour']['AveragePosition'];
       
    var thisHourImpressions = keywordDataElement['ThisHour']['Impressions'];
    var thisHourAveragePosition = keywordDataElement['ThisHour']['AveragePosition'];
       
    if(thisHourImpressions == lastHourImpressions){
      return 0;
    }
    else{
      var currentPosition = (thisHourImpressions*thisHourAveragePosition-lastHourImpressions*lastHourAveragePosition)/(thisHourImpressions-lastHourImpressions);
      if (currentPosition < 1) {
        return 0;
      } else {
        return currentPosition;
      }
    }
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function keywordUniqueId(keyword){
    var id = keyword.getId();
    var idsIndex = ids.indexOf(id);
    if(idsIndex === ids.lastIndexOf(id)){
      return uniqueIds[idsIndex];
    }
    else{
      var adGroupId = keyword.getAdGroup().getId();
      return adGroupId + idJoin + id;
    }
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function setMinMaxBids(){
    for(var x in keywordData){
      keywordData[x]['MinBid'] = minBid;
      keywordData[x]['MaxBid'] = maxBid;
      keywordData[x]['FirstPageMaxBid'] = firstPageMaxBid;
    }
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function setBidChange(){
    for(var x in keywordData){
      keywordData[x]['BidIncrease'] = keywordData[x]['CpcBid'] * bidIncreaseProportion/2;
      keywordData[x]['BidDecrease'] = keywordData[x]['CpcBid'] * bidDecreaseProportion/2;
    }
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function updateKeywords(idBatch) {
    var keywordIterator = AdWordsApp.keywords()
    .withIds(idBatch.map(function(str){return str.split(idJoin);}))
    .get();
    while(keywordIterator.hasNext()){
      var keyword = keywordIterator.next();
         
      var uniqueId = keywordUniqueId(keyword);
         
      var newBid = bidChange(uniqueId);
         
      if(newBid !== -1){
        keyword.setMaxCpc(newBid);
      }
         
    }
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
  function resultsString(){
       
    var results = [];
    for(var uniqueId in keywordData){
      var resultsRow = [uniqueId, keywordData[uniqueId]['ThisHour']['Impressions'], keywordData[uniqueId]['ThisHour']['AveragePosition']];
      results.push(resultsRow.join(fieldJoin));
    }
       
    return results.join(lineJoin);
  }
     
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
     
}

// ##################################################### new by holger.schulz@data-inside.de ##################

/* Missing folders are created automatically
 * _sFullPath="/dir1/dir2/filename.txt" 
 * return: file or null (error)
*/
function getOrCreateTextFileInFolder(_sFullPath, _sContent) {
  var dir = DriveApp.getRootFolder();
  var res = _sFullPath.split("/");
  for (var i=0;i<res.length;i++) {
    var s = res[i];
    if (i != res.length-1) {
      var dirs = DriveApp.getFoldersByName(s);
      if (dirs.hasNext()) {
        var dirNext = dirs.next();
        if (dirs.hasNext()) {
          Logger.log("Error - more than one folder named '" + s + "'");
          return null;
        }
        dir = dirNext;
      } else {
        dir = dir.createFolder(s);
      }
    } else {
      var files = dir.getFilesByName(s);
      if (files.hasNext()) {
        var file = files.next();
        if (files.hasNext()) {
          Logger.log("Error - more than one file named '" + _sFullPath + "'");
          return null;
        }
        return file; // exists
      }
      return dir.createFile(s, _sContent);
    }
  }
}
