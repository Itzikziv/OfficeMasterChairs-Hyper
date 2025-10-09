$(function() {
    var model = "{{ current_variant.sku | escape }}";
    setTimeout(function() {
      $('.optionLibraryLink').each(function(i, obj) {
        var sectionId = $(obj).attr("optionId") || "";
        if(sectionId){
          sectionId = "#" + sectionId;
        }
        $(obj).attr("href", `https://www.officemasterchairs.com/pages/office-master-${model.toLowerCase()}-options-library${sectionId}`);
        $(obj).attr("target", `_blank`);
      });
    }, 2000);
  });