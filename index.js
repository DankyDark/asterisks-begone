import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
const extensionName = "asterisks-begone";
const defaultSettings = {
  enabled: true,
};

let buttonAdded = false;
let isAddingButton = false;
let buttonAddTimeout = null;

extension_settings[extensionName] = extension_settings[extensionName] || {};
if (!extension_settings[extensionName].hasOwnProperty("enabled")) {
  extension_settings[extensionName].enabled = defaultSettings.enabled;
  saveSettingsDebounced();
}

async function addSettings() {
  try {
    const response = await fetch(
      `/scripts/extensions/third-party/${extensionName}/index.html`
    );
    if (!response.ok) {
      console.error(
        `[${extensionName}] Error loading settings HTML:`,
        response.statusText
      );
      return;
    }

    const html = await response.text();
    $("#extensions_settings").append(html);

    $("#asterisks-begone-enabled").prop(
      "checked",
      extension_settings[extensionName].enabled
    );

    $("#asterisks-begone-enabled").on("change", function () {
      extension_settings[extensionName].enabled = !!$(this).prop("checked");
      saveSettingsDebounced();

      if (extension_settings[extensionName].enabled) {
        checkAndAddButton();
      } else {
        $(".asterisks-begone-button").remove();
        buttonAdded = false;
      }
    });
  } catch (error) {
    console.error(`[${extensionName}] Error adding settings:`, error);
  }
}

function checkAndAddButton() {
  if (buttonAddTimeout) {
    clearTimeout(buttonAddTimeout);
    buttonAddTimeout = null;
  }

  buttonAddTimeout = setTimeout(() => {
    if (isAddingButton) return;

    try {
      isAddingButton = true;

      $(".asterisks-begone-button").remove();

      if (!extension_settings[extensionName].enabled) {
        buttonAdded = false;
        isAddingButton = false;
        return;
      }

      if ($(".asterisks-begone-button").length > 0) {
        buttonAdded = true;
        isAddingButton = false;
        return;
      }

      const firstMessageLabel = $('div:contains("First message")').filter(
        function () {
          return $(this).text().trim() === "First message";
        }
      );

      const button = $("<input>", {
        type: "button",
        id: "asterisks-begone-button",
        class: "menu_button asterisks-begone-button",
        value: "Asterisks Begone",
        style:
          "display: inline-block !important; visibility: visible !important; opacity: 1 !important;",
        click: removeAsterisks,
      });

      if (firstMessageLabel.length) {
        button.insertAfter(firstMessageLabel);
        buttonAdded = true;
        console.log("[Asterisks-Begone] Loaded.");
      } else {
        console.log("[Asterisks-Begone] Could not load.");
      }
    } finally {
      isAddingButton = false;
    }
  }, 100);
}

async function removeAsterisks() {
  try {
    const context = getContext();
    const characterId = context.characterId;

    if (!characterId) {
      toastr.info("No character selected");
      return;
    }

    const character = context.characters[characterId];
    if (!character) {
      console.error("[Asterisks-Begone] Character not found in context");
      toastr.error("Character data not found");
      return;
    }

    let hasChanges = false;

    let examplesText = $("#mes_example_textarea").val();
    if (examplesText) {
      const cleanedExamples = examplesText.replace(/\*/g, "");
      if (cleanedExamples !== examplesText) {
        $("#mes_example_textarea").val(cleanedExamples);
        examplesText = cleanedExamples;
        hasChanges = true;
      }
    }

    let firstMessage = $("#firstmessage_textarea").val();
    if (firstMessage) {
      const cleanedFirstMessage = firstMessage.replace(/\*/g, "");
      if (cleanedFirstMessage !== firstMessage) {
        $("#firstmessage_textarea").val(cleanedFirstMessage);
        firstMessage = cleanedFirstMessage;
        hasChanges = true;
      }
    }

    let cleanedGreetings = [];
    if (character?.data?.alternate_greetings) {
      let altGreetingsChanged = false;
      cleanedGreetings = character.data.alternate_greetings.map((greeting) => {
        const cleaned = greeting.replace(/\*/g, "");
        if (cleaned !== greeting) {
          altGreetingsChanged = true;
        }
        return cleaned;
      });

      if (altGreetingsChanged) {
        character.data.alternate_greetings = cleanedGreetings;
        hasChanges = true;

        if ($("#alternate_greetings_template").length) {
          $("#alternate_greetings_template").val(
            JSON.stringify(cleanedGreetings, null, 2)
          );
        }
      }
    }

    if (hasChanges) {
      try {
        if (examplesText) {
          const exampleTextarea = $("#mes_example_textarea");
          exampleTextarea.val(examplesText);
          exampleTextarea.trigger("change");
        }

        if (firstMessage) {
          const firstMessageTextarea = $("#firstmessage_textarea");
          firstMessageTextarea.val(firstMessage);
          firstMessageTextarea.trigger("change");
        }

        $("#create_button").trigger("click");
        toastr.success("Asterisks, BEGONE!");
      } catch (saveError) {
        console.error("[Asterisks-Begone] Save error:", saveError);
        toastr.error("Error saving changes: " + saveError.message);
        toastr.info("Please save the character manually to apply changes");
      }
    } else {
      toastr.info("No asterisks found to remove");
    }
  } catch (error) {
    console.error("[Asterisks-Begone] Error removing asterisks:", error);
    toastr.error("Error: " + error.message);
  }
}

$(document).ready(function () {
  addSettings();

  $(document).on(
    "click",
    ".character_select, #rm_button_selected_ch",
    function () {
      setTimeout(checkAndAddButton, 300);
    }
  );

  $(document).on("click", ".advanced_button, .toggle_advanced", function () {
    setTimeout(checkAndAddButton, 300);
  });

  setTimeout(checkAndAddButton, 1000);
  setTimeout(checkAndAddButton, 2000);
});
