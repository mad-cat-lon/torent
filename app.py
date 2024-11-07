import streamlit as st
import pandas as pd
import altair as alt
from fuzzywuzzy import fuzz, process

# Constants
BYLAW_ADDR_COLUMN = "AddrLine"
FIRE_ADDR_COLUMN = "PropertyAddress"
INVESTIGATION_ID_COLUMN = "INVESTIGATION_ID"
INSPECTION_OPEN_DATE_COLUMN = "INSPECTIONS_OPENDATE"
ADDRESS_FILES = {
    "bylaw_addrs": "data/bylaw/Addresses.csv",
    "bylaw_defs": "data/bylaw/Deficiencies.csv",
    "bylaw_investigations": "data/bylaw/Investigations.csv",
    "fire_inspections": "data/fire/Highrise_Inspections_Data.csv",
    "fire_incidents": "data/fire/Fire Incidents Data.csv"
}

# Streamlit UI Configuration
st.set_page_config(layout="wide")
st.sidebar.title("Toronto Highrise Safety Check")
address = st.sidebar.text_input("Enter Address", "").strip()

# Load CSV files
@st.cache_data
def load_data(files):
    dataframes = {}
    for key, path in files.items():
        try:
            dataframes[key] = pd.read_csv(path, low_memory=False)
        except FileNotFoundError:
            st.error(f"File {path} not found.")
    return dataframes

data = load_data(ADDRESS_FILES)
bylaw_invg_addrs_df = data["bylaw_addrs"]
bylaw_invg_defs_df = data["bylaw_defs"]
bylaw_invg_df = data["bylaw_investigations"]
fire_inspections_df = data["fire_inspections"]


def get_closest_match(address, column, df, threshold=70):
    """Return closest matches for an address based on the threshold."""
    potential_matches = df[column].unique()
    return [match[0] for match in process.extractBests(address.upper(), potential_matches, scorer=fuzz.token_sort_ratio, score_cutoff=threshold)]


def create_status_chart(df, x_col, y_col, title):
    """Create a simple Altair bar chart with tooltips."""
    return alt.Chart(df).mark_bar().encode(
        x=f"{x_col}:O", y=f"{y_col}:Q", tooltip=[x_col, y_col]
    ).properties(title=title).interactive()


def generate_timeline_chart(df, date_column, view):
    """Generate timeline charts based on view selection (Yearly/Monthly)."""
    df[date_column] = pd.to_datetime(df[date_column])
    if view == "Yearly":
        df["Year"] = df[date_column].dt.year
        timeline = df.groupby("Year").size().reset_index(name="Count")
        return create_status_chart(timeline, "Year", "Count", "Yearly Count")
    elif view == "Monthly":
        df["Month"] = df[date_column].dt.to_period("M").dt.strftime('%Y-%m')
        timeline = df.groupby("Month").size().reset_index(name="Count")
        return alt.Chart(timeline).mark_line(point=True).encode(
            x="Month:O", y="Count:Q", tooltip=["Month", "Count"]
        ).properties(title="Monthly Count").interactive()


def search_data(address, df, addr_column, invg_df=None, defs_df=None):
    """Search for investigations and deficiencies based on address."""
    closest_matches = get_closest_match(address, addr_column, df)
    if not closest_matches:
        return {"found": False, "suggestions": closest_matches}

    found_address = closest_matches[0]
    results = df[df[addr_column] == found_address]
    if invg_df is not None and defs_df is not None:
        inv_ids = results[INVESTIGATION_ID_COLUMN].tolist()
        return {
            "found": True,
            "address": found_address,
            "investigations": invg_df[invg_df[INVESTIGATION_ID_COLUMN].isin(inv_ids)],
            "deficiencies": defs_df[defs_df[INVESTIGATION_ID_COLUMN].isin(inv_ids)],
            "suggestions": closest_matches[1:]
        }
    return {
        "found": True,
        "address": found_address,
        "inspections": results,
        "suggestions": closest_matches[1:]
    }


if address:
    bylaw_results = search_data(address, bylaw_invg_addrs_df, BYLAW_ADDR_COLUMN, bylaw_invg_df, bylaw_invg_defs_df)
    fire_results = search_data(address, fire_inspections_df, FIRE_ADDR_COLUMN)

    if not bylaw_results["found"] and not fire_results["found"]:
        st.write("No exact matches found.")
        suggestions = set(bylaw_results["suggestions"] + fire_results["suggestions"])
        if suggestions:
            st.write("Did you mean:")
            for suggestion in suggestions:
                st.button(suggestion)
    else:
        st.header(f"Results for {bylaw_results.get('address') or fire_results.get('address')}")
        bylaw_col, fire_col = st.columns(2)

        with bylaw_col:
            st.subheader("Bylaw Investigations")
            if bylaw_results["found"]:
                with st.expander("Investigation Summary"):
                    invgs = bylaw_results["investigations"]
                    st.dataframe(invgs[["Issue", "InType", "Status", "InDate"]])

                    # Investigation status chart
                    status_counts = invgs["Status"].value_counts().reset_index(name="Count")
                    st.altair_chart(create_status_chart(status_counts, "Status", "Count", "Investigation Status"), use_container_width=True)

                    # Timeline charts
                    view_selection = st.selectbox("Select View", ["Yearly", "Monthly"], key="invg_view")
                    st.altair_chart(generate_timeline_chart(invgs, "InDate", view_selection), use_container_width=True)

                with st.expander("Deficiencies"):
                    deficiencies = bylaw_results["deficiencies"]
                    if not deficiencies.empty:
                        st.dataframe(deficiencies[["Desc", "Location", "Status"]])
                        deficiency_counts = deficiencies["Status"].value_counts().reset_index(name="Count")
                        st.altair_chart(create_status_chart(deficiency_counts, "Status", "Count", "Deficiency Status"), use_container_width=True)
                    else:
                        st.write("No deficiencies found.")

        with fire_col:
            st.subheader("Fire Code Violations")
            if fire_results["found"]:
                with st.expander("Inspection Summary"):
                    inspections = fire_results["inspections"]
                    st.dataframe(inspections[[INSPECTION_OPEN_DATE_COLUMN, "VIOLATION_DESCRIPTION"]])

                    # Timeline charts
                    st.subheader("Violations")
                    view_selection = st.selectbox("Select View", ["Yearly", "Monthly"], key="fire_view")
                    st.altair_chart(generate_timeline_chart(inspections, INSPECTION_OPEN_DATE_COLUMN, view_selection), use_container_width=True)
            else:
                st.write("No fire code inspections found for this address.")
